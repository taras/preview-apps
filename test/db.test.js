const git = require("@cardstack/git/service");
const process = require("child_process");
const expect = require("expect");
const { writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const tmp = require("tmp");
const { promisify } = require("util");
const logger = require("@cardstack/logger");
const DB = require("../src/db");

logger.configure({
  defaultLevel: "warn"
});

const exec = promisify(process.exec);

async function setup() {
  let tmpDir = tmp.dirSync().name;

  await exec(`cd ${tmpDir} && git init`);

  return {
    path: tmpDir,
    exec: cmd => exec(`cd ${tmpDir} && ${cmd}`)
  };
}

describe("db", () => {
  let db, remote;
  beforeEach(async () => {
    remote = await setup();

    writeFileSync(join(remote.path, "name"), "taras");

    await remote.exec("git add name");
    await remote.exec('git commit -m "Added name file"');

    class Schema {
      constructor() {
        this.name = String;
      }
    }

    db = await DB.open(Schema, remote.path);
  });

  describe("opening the database", () => {
    it("has different working directory than remote", () => {
      expect(remote.path).not.toBe(db.path);
    });

    it("clone the remote repo", () => {
      expect(existsSync(join(db.path, "name"))).toBe(true);
    });

    it("has the content", () => {
      expect(db.$.name.state).toBe("taras");
    });

    it("doesn't have any changes", () => {
      expect(db.hasChanges).toBe(false);
    });
  });

  describe("changing the database content", () => {
    beforeEach(() => {
      db.$.name.concat("!!!");
    });
    it("allows to change the content", () => {
      expect(db.$.name.state).toBe("taras!!!")
    });
    it("detects that there are changes", () => {
      expect(db.hasChanges).toBe(true);
    });
  });
});
