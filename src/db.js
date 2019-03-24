const log = require("@cardstack/logger")("db");
const git = require("@cardstack/git/service");
const { Signature, Branch, Commit, Merge } = require("nodegit");
const { Any, Store, create, valueOf } = require("microstates");
const { read, ls, applyChanges } = require("./fs");
const crypto = require('crypto');
const os = require("os");

module.exports = class DB {
  /**
   * Create a database connection by providing a schema and remote url where
   * the database content is located. The remoteUrl is url of git repository
   * which will be used as the data for the database.
   *
   * @param {Type} constructor
   * @param {String} remoteUrl
   */
  static async open(Type = Any, remote) {
    // open the repository
    let repo = await git.getRepo(remote.url, remote);

    await git.pullRepo(remote.url, "master")

    return new this(Type, repo, remote);
  }

  constructor(Type, repo, remote) {
    this.repo = repo;
    this.remote = remote;
    this.fetchOpts = remote.fetchOpts;
    this.Type = Type;
    this.value = read(this.path);

    this.hostname = os.hostname();
    this.myName = `PID${process.pid} on ${this.hostname}`;
    this.myEmail = `${os.userInfo().username}@${this.hostname}`;
    this.targetBranch = "master";

    this.onChange = $ => {
      applyChanges(valueOf($), this.path);
      this.$ = $;
    };

    this.$ = Store(create(Type, this.value), this.onChange);
  }

  get path() {
    return this.repo.workdir();
  }

  get hasChanges() {
    return this.value !== valueOf(this.$);
  }

  async getHeadCommit(targetBranch = "master", remote = false) {
    let { repo } = this;

    let headRef;
    try {
      if (remote) {
        headRef = await Branch.lookup(repo, `origin/${targetBranch}`, Branch.BRANCH.REMOTE);
      } else {
        headRef = await Branch.lookup(repo, targetBranch, Branch.BRANCH.LOCAL);
      }
    } catch(err) {
      if (err.errorFunction !== 'Branch.lookup') {
        throw err;
      }
    }
    if (headRef) {
      return await Commit.lookup(repo, headRef.target());
    }
  }
  
  async commit(message = `Wrote to the database`) {
    let { repo } = this;

    let index = await repo.refreshIndex();

    let status = await repo.getStatus();

    await Promise.all(status.map(file => index.addByPath(file.path())));

    await index.write();

    let oid = await index.writeTree();

    let head = await this.getHeadCommit();

    let author = Signature.now(this.myName, this.myEmail);

    // TODO: make commiter the authenticated user
    let commiter = Signature.now(this.myName, this.myEmail);
    
    let commit = await repo.createCommit("HEAD", author, commiter, message, oid, [head])

    return commit;
  }

  async _makeMergeCommit(newCommit, commitOpts) {
    let headCommit = await this.getHeadCommit();

    if (!headCommit) {
      // new branch, so no merge needed
      return newCommit;
    }

    let baseOid = await Merge.base(this.repo, newCommit, headCommit);
    if (baseOid.equal(headCommit.id())) {
      // fast forward (we think), so no merge needed
      return newCommit;
    }

    let index = await Merge.commits(this.repo, newCommit, headCommit, null);

    if (index.hasConflicts()) {
      throw new GitConflict(index);
    }
    
    let treeOid = await index.writeTreeTo(this.repo);

    let tree = await Tree.lookup(this.repo, treeOid, null);

    let { author, committer } = signature(commitOpts);

    let mergeCommitOid = await Commit.create(this.repo, null, author, committer, 'UTF-8', `Clean merge into ${this.targetBranch}`, tree, 2, [newCommit, headCommit]);

    return await Commit.lookup(this.repo, mergeCommitOid);
  }

  async push() {
    let { repo } = this;

    let commitOpts = {
      author: Signature.now(this.myName, this.myEmail),
      committer: Signature.now(this.myName, this.myEmail)
    }

    let newCommit = await this.getHeadCommit();
    
    let mergeCommit = await this._makeMergeCommit(newCommit, commitOpts);

    const remoteBranchName = `temp-remote-${crypto.randomBytes(20).toString('hex')}`;

    await Branch.create(repo, remoteBranchName, mergeCommit, false);

    let remote = await repo.getRemote("origin");

    try {
      await remote.push([`refs/heads/${remoteBranchName}:refs/heads/${this.targetBranch}`], this.fetchOpts);
    } catch (err) {
      // pull remote before allowing process to continue
      await this.repo.fetchAll(this.fetchOpts);
      throw err;
    }
  }
};

class GitConflict extends Error {
  constructor(index) {
    super();
    this.index = index;
  }
}

function signature(commitOpts) {
  let date = commitOpts.authorDate || moment();
  let author = Signature.create(commitOpts.authorName, commitOpts.authorEmail, date.unix(), date.utcOffset());
  let committer = commitOpts.committerName ? Signature.create(commitOpts.committerName, commitOpts.committerEmail, date.unix(), date.utcOffset()) : author;
  return {
    author,
    committer
  };
}