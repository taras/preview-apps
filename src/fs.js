const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { stable } = require("funcadelic");
const isObject = require("lodash.isobject");
const rimraf = require("rimraf");

const { getOwnPropertyDescriptors, keys, defineProperty } = Object;

/**
 * Read takes a directory path and returns an object
 * that represents the contents of this directory.
 *
 * Each property on the object represents a file or a directory.
 * The values of each property are evaluated lazily.
 *
 * When the value is read, the corresponding files or directory is read.
 * The value is then parsed as an yaml file.
 * @param {*} directory
 */
function read(directory) {
  let fileNames = fs.readdirSync(directory);

  // "0" means that it's an array (I hope)
  let isArrayDirectory = fileNames.includes("0");

  let initial = {};
  if (isArrayDirectory) {
    defineProperty(initial, Symbol.iterator, {
      enumerable: false,
      configurable: true,
      value() {
        let object = this;
        let iterator = fileNames
          .map(index => +index)
          .sort()
          [Symbol.iterator]();
        return {
          next() {
            let next = iterator.next();
            return {
              get done() {
                return next.done;
              },
              get value() {
                if (next.done) {
                  return undefined;
                } else {
                  return object[next.value];
                }
              }
            };
          }
        };
      }
    });
  }

  return fileNames.reduce(
    (acc, name) =>
      defineProperty(acc, name, {
        get: stable(() => {
          let itemPath = path.join(directory, name);
          let stats = fs.statSync(itemPath);
          if (stats.isDirectory()) {
            return read(itemPath);
          } else if (stats.isFile()) {
            return yaml.safeLoad(fs.readFileSync(itemPath, "utf8"));
          }
        }),
        enumerable: false,
        configurable: true
      }),
    initial
  );
}

/**
 * Write merges a directory object into a destination. It will look for
 * iterable keys on the directory object, ignoring non iterable keys.
 *
 * The idea here is that only files that were materialized would need to
 * be updated. Reading a file would materialize it which could cause an
 * upchanged file to be updated but hopefully the impact of this will
 * be nullified by the Yaml serializing same data same way.
 *
 * When undefined value is encountered, this is treated as a deletion.
 *
 * @param {Object} directory
 * @param {String} destination
 */
function applyChange(directory, destination) {
  keys(directory).forEach(name => {
    let value = directory[name];
    let itemPath = path.join(destination, name);
    if (isObject(value)) {
      if (fs.existsSync(itemPath)) {
        if (fs.statSync(itemPath).isFile()) {
          fs.unlinkSync(itemPath);
          fs.mkdirSync(itemPath);
        }
      } else {
        fs.mkdirSync(itemPath);
      }
      keys(value).forEach(key => {
        if (isObject(value[key])) {
          if (!fs.existsSync(path.join(itemPath, key))) {
            fs.mkdirSync(path.join(itemPath, key));
          }
          applyChange(value[key], path.join(itemPath, key));
        } else {
          writeFile(value[key], path.join(itemPath, key));
        }
      });
    } else {
      writeFile(value, itemPath);
    }
  });

  ls(read(destination)).forEach(name => {
    if (!directory.hasOwnProperty(name)) {
      let itemPath = path.join(destination, name);
      let stats = fs.statSync(itemPath);
      if (stats.isFile()) {
        fs.unlinkSync(itemPath);
      } else if (stats.isDirectory()) {
        rimraf.sync(itemPath);
      }
    }
  });
}

/**
 *
 * @param {any} value
 * @param {string} filePath
 */
function writeFile(value, filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    rimraf.sync(filePath);
  }
  if (value === undefined) {
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, yaml.safeDump(value), { encoding: "utf8" });
  }
}

const ls = o => keys(getOwnPropertyDescriptors(o));

module.exports = {
  read,
  applyChange,
  ls
}