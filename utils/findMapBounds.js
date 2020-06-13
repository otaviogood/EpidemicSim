"use strict";
var assert = require("assert");

const misc = require("./misc");
const countyInfo = require("./countyUtils");
const mapBounds = require("./mapBounds");

let countyBoundsFile = "processedData/" + mapBounds.defaultPlace + "_AllCountyBounds.json";

async function doStuff() {
    let countyStuff = new countyInfo.CountyInfo();
    let allBounds = await countyStuff.findCountyBounds();
    console.log(allBounds);
    misc.saveJSONMap(countyBoundsFile, allBounds);
}

doStuff();
