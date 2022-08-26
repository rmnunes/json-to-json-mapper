import * as fs from "fs";

const converted = [];
export function dotNotation(obj, prefix, relPath, isArray) {
  (prefix = prefix || ""), (relPath = relPath || "");

  Object.keys(obj).forEach(function (key) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      if (Array.isArray(obj[key])) {
        dotNotation(obj[key], prefix + key + ".", relPath + key + ".", true);
      } else {
        if (isArray) {
          dotNotation(obj[key], prefix + key + ".", relPath, false);
        } else {
          dotNotation(obj[key], prefix + key + ".", relPath + key + ".", false);
        }
      }
    } else {
      converted.push({ source: relPath + key });
    }
  });

  return converted;
}

export function checkSkippedFieldsFromSource(obj, mappings) {
  let elementList = dotNotation(obj, "", "", false);
  for (var item in mappings) {
    elementList = elementList.filter((x) => x.source !== mappings[item].source);
  }
  return JSON.stringify(elementList);
}

export function save(f) {
  fs.writeFile("user.json", JSON.stringify(f), (err) => {
    if (err) {
      throw err;
    }
    console.log("JSON data is saved.");
  });
}
