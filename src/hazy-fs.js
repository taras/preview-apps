import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { stable } from "funcadelic";
import isObject from "lodash.isobject";

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
 * 
 * 
 * @param {*} directory
 */
export function read(directory) {
  return fs.readdirSync(directory).reduce(
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
    {}
  );
}

export function write(directory, destination) {
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
        fs.mkdirSync(itemPath)
      }
      keys(value).forEach(key => {
        if (isObject(value[key])) {
          write(value[key], path.join(itemPath, key))
        } else {
          writeFile(value[key], path.join(itemPath, key))
        }
      })
    } else {
      writeFile(value, itemPath);
    }
  })
}

function writeFile(value, filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    fs.rmdirSync(filePath);
  }
  fs.writeFileSync(filePath, yaml.safeDump(value), { encoding: "utf8" });      
}

export const ls = o => keys(getOwnPropertyDescriptors(o));
