const log = require('@cardstack/logger')('db');
const git = require("@cardstack/git/service");
const { Any, Store, create, valueOf } = require('microstates');
const { read, ls, applyChanges } = require("./fs");

module.exports = class DB {

  /**
   * Create a database connection by providing a schema and remote url where
   * the database content is located. The remoteUrl is url of git repository
   * which will be used as the data for the database.
   * 
   * @param {Type} constructor
   * @param {String} remoteUrl
   */
  static async open(Type = Any, remoteUrl) {
    // open the repository
    let repo = await git.getRepo(remoteUrl, { url: remoteUrl });

    // read the value from the repository
    let value = read(repo.workdir());

    // create a microsate
    let data = create(Type, value);

    return new this(repo, data);
  }

  constructor(repo, initial) {
    this.repo = repo;
    this._initial = valueOf(initial);
    
    const update = $ => {
      this.$ = $;
      applyChanges(valueOf($), this.path);
    }

    this.$ = Store(initial, update);
  }

  get path() {
    return this.repo.workdir();
  }

  get hasChanges() {
    return this._initial !== valueOf(this.$);
  }
}