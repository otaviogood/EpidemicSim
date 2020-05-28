"use strict";

var assert = require("assert");
const fs = require("fs");
const GeoTIFF = require("geotiff");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);

const mapBounds = require("./mapBounds");
const boundsLatMin = mapBounds.info[mapBounds.defaultPlace].latMin;
const boundsLatMax = mapBounds.info[mapBounds.defaultPlace].latMax;
const boundsLonMin = mapBounds.info[mapBounds.defaultPlace].lonMin;
const boundsLonMax = mapBounds.info[mapBounds.defaultPlace].lonMax;

// From https://dataforgood.fb.com/docs/high-resolution-population-density-maps-demographic-estimates-documentation/
// Data here: https://data.humdata.org/dataset/united-states-high-resolution-population-density-maps-demographic-estimates
// Geotiffs are a common format for raster GIS data. All common GIS software packages can read geotiffs. The value in each cell is the (statistical) number of people in that grid.
// This is commonly fractional, and sometimes less than 1. Geographically, each cell of the geotiff represents a 1-arc-second-by-1-arc-second grid.
// This is a 30.87-meter-by-30.87-meter square at the equator. Due to the Earth’s curvature, the east-west length of this cell decreases as one gets closer to the poles.
// For example, at 49 degrees latitude, it is a 30.87-meter-by-20.25-meter square. Each geotiff’s metadata has the coordinates of the northwest corner, which allows the grid to be overlayed on maps.
// The projection/datum is EPSG:4326/WGS84, which is encoded in the metadata.
// ---------------------------
// I used QGIS software to export a layer inside of the lat/lon bounds.
// let fileName = "../sourceData/sf_raster.tif";  // This is faster so I can iterate on ideas. Should be same output as original file.
let fileName = "../sourceData/population_usa28_-130_2019-07-01.tif";

// San Francisco limits -122.526, -122.354, 37.708, 37.815
// let latMin = 37.708;
// let latMax = 37.815;
// let lonMin = -122.526;
// let lonMax = -122.354;

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}
function toRadians(angle) {
    return angle * (Math.PI / 180);
}
// Area of one pixel of the geotiff data
function calcCellArea(lat) {
    return 30.87 * 30.87 * Math.cos(toRadians(lat));
}

// Round a number up or down randomly, weighted by the fractional component
function roundRandom(x) {
    let frac = x % 1;
    let r = rand.random();
    if (r < frac) return Math.floor(x) + 1;
    else return Math.floor(x);
}

async function doStuff() {
    // Load geotiff file
    const fileContents = fs.readFileSync(fileName);
    let buffer2 = Buffer.from(fileContents);
    let arrayBuffer = Uint8Array.from(buffer2).buffer;
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);

    const image = await tiff.getImage(); // by default, the first image is read.

    const width = image.getWidth();
    const height = image.getHeight();
    const tileWidth = image.getTileWidth();
    const tileHeight = image.getTileHeight();
    const samplesPerPixel = image.getSamplesPerPixel();

    // when we are actually dealing with geo-data the following methods return
    // meaningful results:
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    const bbox = image.getBoundingBox();

    let lonMin = bbox[0];
    let latMin = bbox[1];
    let lonMax = bbox[2];
    let latMax = bbox[3];
    assert(lonMin <= boundsLonMin, "ERROR: source map file doesn't contain desired map bounds.");
    assert(latMin <= boundsLatMin, "ERROR: source map file doesn't contain desired map bounds.");
    assert(lonMax >= boundsLonMax, "ERROR: source map file doesn't contain desired map bounds.");
    assert(latMax >= boundsLatMax, "ERROR: source map file doesn't contain desired map bounds.");
    var cellArea = calcCellArea(origin[1]); // Use corner... Works for smallish areas like cities - not for whole countries.

    console.log("lat/lon bounds in geotiff file:   " + bbox);
    console.log("lat/lon bounds in for our region: " + [boundsLonMin, boundsLatMin, boundsLonMax, boundsLatMax]);
    const data = await image.readRasters();
    const { width2, height2 } = data;
    let allPeople = [];
    let allBuildings = [];
    let buffer = data[0];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let pixel = buffer[x + y * width];
            if (Number.isNaN(pixel)) continue;
            let xpos = (x * 1.0) / (width - 1);
            let ypos = 1.0 - (y * 1.0) / (height - 1); // I guess bitmap is upside down?
            let lon = xpos * (lonMax - lonMin) + lonMin;
            let lat = ypos * (latMax - latMin) + latMin;
            // I guess this could be done more efficiently if anyone cares...
            if (lat < boundsLatMin) continue;
            if (lon < boundsLonMin) continue;
            if (lat > boundsLatMax) continue;
            if (lon > boundsLonMax) continue;
            let numPeopleInCell = roundRandom(pixel); // Randomly sample the fractional component
            if (numPeopleInCell > 0) {
                allBuildings.push([lat, lon, numPeopleInCell]);
                for (let i = 0; i < numPeopleInCell; i++) {
                    allPeople.push([lat, lon]);
                }
            }
        }
    }
    fs.writeFileSync("processedData/" + mapBounds.defaultPlace + "_PeoplePositions.json", JSON.stringify(allPeople));
    console.log(allPeople.length.toString() + " people locations written to file.");
    fs.writeFileSync("processedData/" + mapBounds.defaultPlace + "_BuildingPositions.json", JSON.stringify(allBuildings));
    console.log(allBuildings.length.toString() + " building locations written to file.");
}

doStuff();
