import expect from "expect";
import { read, ls, write } from "../src/hazy-fs";
import path from "path";
import tmp from "tmp";
import fs from "fs";
import { append } from "funcadelic";

function fixturePath(fixtureName) {
  return path.join(__dirname, "fixtures", fixtureName);
}

let EMPTY;
const BASIC = fixturePath("basic");

before(() => {
  EMPTY = tmp.dirSync().name;
  if (!fs.existsSync(path.join(BASIC, "emptyDir"))) {
    fs.mkdirSync(path.join(BASIC, "emptyDir"));
  }
});

describe("hazy-fs", () => {
  describe("ls", () => {
    let names;

    beforeEach(() => {
      names = ls(read(BASIC));
    });

    it("returns each file and directory", () => {
      expect(names).toHaveLength(7);
    });

    it("has all of the files in it", () => {
      expect(names.sort()).toMatchObject([
        "UPPERCASE",
        "dirWithFile",
        "emptyDir",
        "false",
        "number",
        "string",
        "true"
      ]);
    });
  });

  describe("reading", () => {
    describe("empty directory", () => {
      let dir;
      beforeEach(() => {
        dir = read(EMPTY);
      });
      it("has no files", () => {
        expect(ls(dir)).toHaveLength(0);
      });
    });

    describe("basic types", () => {
      let dir;

      beforeEach(() => {
        dir = read(BASIC);
      });

      it("has non enumerable properties", () => {
        expect(Object.keys(dir)).toEqual([]);
      });

      it("has a number", () => {
        expect(dir.number).toBe(42);
      });
      it("has a string", () => {
        expect(dir.string).toBe("hello world");
      });
      it("has true boolean", () => {
        expect(dir.true).toBe(true);
      });
      it("has false boolean", () => {
        expect(dir.false).toBe(false);
      });
      it("has a directory", () => {
        expect(dir.emptyDir).toBeTruthy();
      });
      it("has no files in the empty directory", () => {
        expect(ls(dir.emptyDir)).toHaveLength(0);
      });
      it("has a file in a directory", () => {
        expect(ls(dir.dirWithFile)).toBeTruthy();
      });
      it("has contents of the dirWithFile", () => {
        expect(dir.dirWithFile.something).toBe("something is here");
      });
      it("works with CAPITALIZED files", () => {
        expect(dir.UPPERCASE).toBe("BIG CONTENT");
      });
    });
  });

  describe("writing", () => {
    describe("adding", () => {
      let target;
      beforeEach(() => {
        let { name } = tmp.dirSync();
        target = name;
      });

      it("adds a string", () => {
        write({ message: "hello world" }, target);

        let result = read(target);

        expect(result.message).toBe("hello world");
        expect(ls(result)).toEqual(["message"]);
      });

      it("adds a number", () => {
        write({ number: 42 }, target);

        let result = read(target);

        expect(result.number).toBe(42);
        expect(ls(result)).toEqual(["number"]);
      });

      it("adds an empty directory", () => {
        write({ emptyDir: {} }, target);

        let result = read(target);

        expect(result.emptyDir).toEqual({});
        expect(ls(result)).toEqual(["emptyDir"]);
      });

      it("adds a directory and a file", () => {
        write(
          {
            files: {
              true: true
            }
          },
          target
        );

        let result = read(target);

        expect(result.files.true).toBe(true);
        expect(ls(result)).toEqual(["files"]);
        expect(ls(result.files)).toEqual(["true"]);
      });

      it("reuses a directory when it exists", () => {
        fs.mkdirSync(path.join(target, "files"));

        write(
          {
            files: {
              true: true
            }
          },
          target
        );

        let result = read(target);

        expect(result.files.true).toBe(true);
        expect(ls(result)).toEqual(["files"]);
        expect(ls(result.files)).toEqual(["true"]);
      });

      it("can overwrite a directory with a file", () => {
        fs.mkdirSync(path.join(target, "config"));

        write({ config: "do it" }, target);

        let result = read(target);

        expect(result.config).toBe("do it");
        expect(ls(result)).toEqual(["config"]);
      });

      it("can overwrite a file with a directory", () => {
        fs.writeFileSync(path.join(target, "busyPlace"), "stuff in it", {
          encoding: "utf8"
        });

        write({ busyPlace: {} }, target);

        let result = read(target);

        expect(result.busyPlace).toEqual({});
        expect(ls(result)).toEqual(["busyPlace"]);
      });
    });

    describe("deleting", () => {
      let target;

      beforeEach(() => {
        let { name } = tmp.dirSync();
        target = name;
        fs.mkdirSync(path.join(target, "parent"));
        fs.mkdirSync(path.join(target, "parent", "child"));
        fs.writeFileSync(path.join(target, "parent", "name"), "Bob", {
          encoding: "utf8"
        });
        fs.writeFileSync(path.join(target, "parent", "child", "name"), "Jane", {
          encoding: "utf8"
        });
      });

      it("can delete everything", () => {
        write({}, target);

        let result = read(target);

        expect(ls(result)).toEqual([]);
      });

      it("can delete just one file", () => {
        let t = read(target);

        write(
          append(t, {
            parent: append(t.parent, { name: undefined })
          }),
          target
        );

        let result = read(target);

        expect(ls(result)).toEqual(["parent"]);
        expect(ls(result.parent)).toEqual(["child"]);
        expect(ls(result.parent.child)).toEqual(["name"]);
      });

      it("can delete just a directory", () => {
        let t = read(target);

        write(
          append(t, {
            parent: append(t.parent, { child: undefined })
          }),
          target
        );

        let result = read(target);

        expect(ls(result)).toEqual(["parent"]);
        expect(ls(result.parent)).toEqual(["name"]);
        expect(result.parent.child).toBeUndefined();
      });
    });
  });
});
