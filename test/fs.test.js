const expect = require("expect");
const { read, ls, applyChanges } = require("../src/fs");
const path = require("path");
const tmp = require("tmp");
const fs = require("fs");
const { append } = require("funcadelic");
const { default: TodoMVC } = require("@microstates/todomvc");
const { create, Store, valueOf } = require("microstates");

function fixturePath(fixtureName) {
  return path.join(__dirname, "fixtures", fixtureName);
}

let EMPTY;
const BASIC = fixturePath("basic");
const TODOMVC = fixturePath("todomvc");
const ARRAY = fixturePath("array");

before(() => {
  EMPTY = tmp.dirSync().name;
  if (!fs.existsSync(path.join(BASIC, "emptyDir"))) {
    fs.mkdirSync(path.join(BASIC, "emptyDir"));
  }
});

describe("microstates-fs", () => {
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

    describe("array", () => {
      let dir, items;

      beforeEach(() => {
        dir = read(ARRAY);
        items = [...dir];
      });

      it("is not a true array according to Array.isArray", () => {
        expect(Array.isArray(dir)).toBeFalsy();
      });

      it("has a length", () => {
        expect(items).toHaveLength(2);
      });

      it("values can be accessed with array accessor", () => {
        expect(items[0]).toHaveProperty("name", "Tom");
        expect(items[1]).toHaveProperty("name", "Jerry");
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
        applyChanges({ message: "hello world" }, target);

        let result = read(target);

        expect(result.message).toBe("hello world");
        expect(ls(result)).toEqual(["message"]);
      });

      it("adds a number", () => {
        applyChanges({ number: 42 }, target);

        let result = read(target);

        expect(result.number).toBe(42);
        expect(ls(result)).toEqual(["number"]);
      });

      it("adds an empty directory", () => {
        applyChanges({ emptyDir: {} }, target);

        let result = read(target);

        expect(result.emptyDir).toEqual({});
        expect(ls(result)).toEqual(["emptyDir"]);
      });

      it("adds a directory and a file", () => {
        applyChanges(
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

        applyChanges(
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

        applyChanges({ config: "do it" }, target);

        let result = read(target);

        expect(result.config).toBe("do it");
        expect(ls(result)).toEqual(["config"]);
      });

      it("can overwrite a file with a directory", () => {
        fs.writeFileSync(path.join(target, "busyPlace"), "stuff in it", {
          encoding: "utf8"
        });

        applyChanges({ busyPlace: {} }, target);

        let result = read(target);

        expect(result.busyPlace).toEqual({});
        expect(ls(result)).toEqual(["busyPlace"]);
      });

      it("can add nested directory", () => {
        applyChanges(
          {
            a: {
              b: {
                c: "C"
              }
            }
          },
          target
        );

        let result = read(target);

        expect(result.a).toBeDefined();
        expect(result.a.b).toBeDefined();
        expect(result.a.b.c).toBe("C");
      });

      it("can write values from an array", () => {
        applyChanges(
          [{ age: 12, name: "Tom" }, { age: 14, name: "Jerry" }],
          target
        );

        let result = read(target);

        expect(result).toHaveProperty("0.age", 12);
        expect(result).toHaveProperty("0.name", "Tom");
        expect(result).toHaveProperty("1.age", 14);
        expect(result).toHaveProperty("1.name", "Jerry");
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
        applyChanges({}, target);

        let result = read(target);

        expect(ls(result)).toEqual([]);
      });

      it("can delete just one file", () => {
        let t = read(target);

        applyChanges(
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

        applyChanges(
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

      it("can remove a file", () => {
        fs.writeFileSync(path.join(target, "serial"), "XXX", {
          encoding: "utf8"
        });

        applyChanges({}, target);

        let result = read(target);

        expect(ls(result)).toEqual([]);
      });
    });
  });

  describe("TodoMVC on FS", () => {
    let target;
    let list;

    beforeEach(() => {
      target = tmp.dirSync().name;

      let initial = create(TodoMVC, read(TODOMVC));

      list = Store(initial, onUpdate);

      function onUpdate(next) {
        list = next;
        let value = valueOf(next);
        applyChanges(value, target);
      }
    });

    it("has todos", () => {
      expect(list.hasTodos).toBeTruthy;
    });

    it("has one completed todo", () => {
      expect([...list.todos][0].completed.state).toBeTruthy();
    });

    it("has one todo with title", () => {
      expect([...list.todos][0].text.state).toBe("Hello World");
    });

    describe("toggling completed state", () => {
      let todos;
      beforeEach(() => {
        todos = [...list.todos];
      });
      it("updated the output", () => {
        todos[0].completed.set(false);
        expect(read(target).todos[0].completed).toBe(false);
      });
      it("initial state is good", () => {
        let value = valueOf(list.todos);
        expect(value[0]).toHaveProperty("text", "Hello World");
        expect(value[0]).toHaveProperty("completed", true);
      });

      describe("pushing things into an array", () => {
        beforeEach(() => {
          list.todos.push({ text: "get it done!", completed: false });
        });

        it("has expected microstate", () => {
          expect(list.todos.length).toEqual(2);
          expect([...list.todos][0].text.state).toEqual("Hello World");
          expect([...list.todos][1].text.state).toEqual("get it done!");
        });

        it("has expected result", () => {
          let result = read(target);

          expect([...result.todos]).toHaveLength(2);
          expect(result.todos[1].text).toEqual("get it done!");
        });
      });
    });
  });
});
