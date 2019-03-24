const log = require("@cardstack/logger")("db");
const git = require("@cardstack/git/service");
const { Reference, Cred, Signature } = require("nodegit");
const { Any, Store, create, valueOf } = require("microstates");
const { read, ls, applyChanges } = require("./fs");
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
    this.Type = Type;
    this.value = read(this.path);

    this.hostname = os.hostname();
    this.myName = `PID${process.pid} on ${this.hostname}`;
    this.myEmail = `${os.userInfo().username}@${this.hostname}`;

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

  async getHead() {
    let head = await Reference.nameToId(this.repo, "HEAD");

    let commit = await this.repo.getCommit(head);

    return commit;
  }

  async commit(message = `Wrote to the database`) {
    let { repo } = this;

    let index = await repo.refreshIndex();

    let status = await repo.getStatus();

    await Promise.all(status.map(file => index.addByPath(file.path())));

    await index.write();

    let oid = await index.writeTree();

    let head = await this.getHead();

    let author = Signature.now(this.myName, this.myEmail);

    // TODO: make commiter the authenticated user
    let commiter = Signature.now(this.myName, this.myEmail);
    
    let commit = await repo.createCommit("HEAD", author, commiter, message, oid, [head])

    return commit.tostrS();
  }
};
