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

async function setup(cmd = "git init --bare") {
  let tmpDir = tmp.dirSync().name;

  await exec(`cd ${tmpDir} && ${cmd}`);

  return {
    path: tmpDir,
    exec: cmd => exec(`cd ${tmpDir} && ${cmd}`)
  };
}

describe("db", () => {
  let db, remote, workdir;
  beforeEach(async () => {
    remote = await setup();
    workdir = await setup(`git init; git remote add origin ${remote.path}`)

    writeFileSync(join(workdir.path, "name"), "taras");

    await workdir.exec("git add name");
    await workdir.exec('git commit -m "Added name file"');
    await workdir.exec('git push origin master')

    class Schema {
      constructor() {
        this.name = String;
      }
    }

    db = await DB.open(Schema, { url: remote.path });
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
    describe("creating a commit with one file", () => {
      let oid;
      beforeEach(async () => {
        oid = (await db.commit()).tostrS();
      });
      it('creates a commit', () => {
        expect(typeof oid).toBe('string');
      });
      describe("pushing the new commit to master", () => {
        beforeEach(async () => {
          await db.push();
        });
        it('pushes the remote repo', async () => {
          expect((await remote.exec(`git rev-parse HEAD`)).stdout).toContain(oid);
        });
      });
    });
  });
});
