import * as fs from "fs";
import { checkSkippedFieldsFromSource } from "./support";

/*
    Accepted Implementations:
      - take 1
      - object to array
      - array to array
      - cast of value
      - transformation of id to string (e.g. id = 9, 9 is equal Brazil , return Brazil as string instead of code, or the oposite, string to code)
      - generate unique Id for arrays
*/

type Error = {
  ref: String;
  message: String;
};

let globalErrors: Error[] = [];

function resolveEnum(e, value) {
  if (e[value] !== undefined) return e[value];
  else {
    console.warn(`Failed to find match to Enum of value: ${value}`);
    globalErrors.push({
      ref: value,
      message: `Failed to find match to Enum of value: ${value}`,
    });
    return String(value);
  }
}

function resolveCasting(e, value) {
  var casted;
  switch (e.name) {
    case "Number":
      casted = Number(value);
      break;
    case "String":
      casted = String(value);
    default:
      value;
  }
  return casted;
}

function clearIndexCtl(ctl) {
  ctl.index = [...ctl.index.filter((x) => x !== -1)];
}

export function assignValue(target, key, value, index, isArray) {
  if (isArray) {
    //the key is array or last element is array
    target.push(value);
  } else if (index !== undefined) {
    if (target[index] === undefined) {
      target.splice(index, 0, { [key]: value });
      if (JSON.stringify(value) === "{}" || JSON.stringify(value) === "[]") {
        return target[index][key];
      } else {
        return target[index];
      }
    } else {
      if (target[index][key] === undefined) {
        Object.assign(target[index], { [key]: value });
        return target[index][key];
      } else {
        return target[index][key];
      }
    }
  } else if (
    value === null ||
    (value !== undefined &&
      typeof value != "function" &&
      typeof value != "symbol")
  ) {
    if (target[key] === undefined) Object.assign(target, { [key]: value });
    return target[key];
  } else {
    throw `Value ${value} is not assignable.`;
  }
}

function assignTarget(target, map, value, ctl) {
  if (Array.isArray(target)) {
    if (ctl.allowance <= 0) clearIndexCtl(ctl);
    if (ctl.index.length > 0) {
      const indexAux = ctl.index[0];
      ctl.index.shift();
      return assignValue(target, map, value, indexAux, false);
    } else {
      if (ctl.allowance > 0) --ctl.allowance;
      return assignValue(target, map, value, 0, false);
    }
  } else {
    return assignValue(target, map, value, undefined, false);
  }
}

function buildJson(map, value, ctl) {
  let target = resulted;
  if (typeof map == "string") {
    let parts = map.split(".");
    if (parts.length == 2 && parts[1] == "$") {
      return assignValue(target, map, value, undefined, true);
    } else if (parts.length > 0) {
      do {
        let part = parts.shift();
        let initialValue;
        if (parts[0] == "$") {
          initialValue = [];
          parts.shift();
        } else {
          initialValue = {};
        }
        target = assignTarget(target, part, target[part] || initialValue, ctl);
      } while (parts.length > 1);
      target = assignTarget(target, parts[0], value, ctl);
      parts.shift();
    } else {
      globalErrors.push({
        ref: map,
        message: `Map ${map} is empty or undefined`,
      });
      throw `Map ${map} is empty or undefined`;
    }
  }
}

const indexCtl = { index: [], allowance: 0 };
function interator(obj, srcMap, tgtMap, format, casting) {
  if (typeof srcMap == "string")
    return interator(obj, srcMap.split("."), tgtMap, format, casting);
  else if (srcMap.length == 0) {
    let value;
    if (
      obj === null ||
      (obj !== undefined &&
        typeof obj != "object" &&
        typeof obj != "function" &&
        typeof obj != "symbol")
    ) {
      value = obj;
      if (format) {
        value = resolveEnum(format, value);
      }

      if (casting) {
        value = resolveCasting(casting, value);
      }
      //TODO: maybe implement a take: 1
      // an option in case is an array and we don't want all (I think this should go to business logic)

      indexCtl.allowance =
        indexCtl.index.filter((x) => x !== -1).length -
        tgtMap.split(".").filter((x: string) => x === "$").length;
      buildJson(tgtMap, value, {
        allowance: indexCtl.allowance,
        index: [...indexCtl.index],
      });
    } else {
      globalErrors.push({
        ref: value,
        message: `Value ${value} is not assignable.`,
      });
      throw `Value ${value} is not assignable.`;
    }
  } else if (Array.isArray(obj)) {
    for (var item in obj) {
      //TODO: create unique identifier ?
      indexCtl.index.push(item);
      if (typeof obj[item] == "object") {
        interator(
          obj[item][srcMap[0]],
          srcMap.slice(1),
          tgtMap,
          format,
          casting
        );
      } else {
        console.warn(`is there an else? iterator for?`);
      }
      indexCtl.index.pop();
    }
  } else {
    if (obj[srcMap[0]] !== undefined) {
      if (indexCtl.index.find((x) => x !== -1)) {
        indexCtl.index.push(-1);
        interator(obj[srcMap[0]], srcMap.slice(1), tgtMap, format, casting);
        indexCtl.index.pop();
      } else {
        interator(obj[srcMap[0]], srcMap.slice(1), tgtMap, format, casting);
      }
    } else {
      console.warn(`Source Element: ${srcMap[0]} not found.`);
      globalErrors.push({
        ref: srcMap[0],
        message: `Source Element: ${srcMap[0]} not found.`,
      });
    }
  }
}

let resulted = {};

export function map(obj, mappings, saveToFile, initial) {
  let result = {};

  resulted = initial;

  const skipped = checkSkippedFieldsFromSource(obj, mappings);

  for (const map in mappings) {
    try {
      indexCtl.allowance = 0;
      indexCtl.index = [];
      interator(
        obj,
        mappings[map].source,
        mappings[map].target,
        mappings[map].enum,
        mappings[map].cast
      );
      Object.assign(result, resulted);
      if (saveToFile) fs.writeFileSync("document.json", JSON.stringify(result));
    } catch (error) {
      console.error(
        `Mapping error: Source: ${mappings[map].source} Target: ${mappings[map].target}`
      );
      console.error(`Error message: ${error}`);
      globalErrors.push({
        ref: `Source: ${mappings[map].source} Target: ${mappings[map].target}`,
        message: `Error message: ${error}`,
      });
    }
  }
  const errors = globalErrors;
  return { result, skipped, errors };
}
