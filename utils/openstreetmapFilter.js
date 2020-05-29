"use strict";

var assert = require("assert");
const fs = require("fs");
var osmread = require("osm-read/osm-read-pbf");
let sleep = require("util").promisify(setTimeout);

// San Francisco limits -122.526, -122.354, 37.708, 37.815
const mapBounds = require("./mapBounds");

const noCacheHack = false; // Use this for very large files... It can be fixed better, but this is placeholder.

let nodeMap = new Map();
let wayMap = new Map();
if (!fs.existsSync("tempCache/")) fs.mkdirSync("tempCache/");
const localNodesFileName = "tempCache/" + mapBounds.defaultPlace + "_localNodesCache.json";
const localWaysFileName = "tempCache/" + mapBounds.defaultPlace + "_localWaysCache.json";
// Got northern california OpenStreetMaps data here: http://download.geofabrik.de/north-america/us/california/norcal.html
const sourceOSMFileName = "../sourceData/norcal-latest.osm.pbf";

let wait = 0;

// Find all open street map *nodes* that are within our bounds
async function localFilterNodes() {
    console.log("Generating file of local openstreetmaps 'nodes'...");
    await osmread.parse({
        filePath: sourceOSMFileName,
        endDocument: function() {
            console.log("document end");
            console.log("nodes: " + nodeMap.size);
            if (!noCacheHack) {
                const localNodes = JSON.stringify(Object.fromEntries(nodeMap));
                fs.writeFileSync(localNodesFileName, localNodes);
            }
            wait++;
        },
        node: function(node) {
            let lat = parseFloat(node.lat);
            let lon = parseFloat(node.lon);
            if (lat < mapBounds.info[mapBounds.defaultPlace].latMin) return;
            if (lat > mapBounds.info[mapBounds.defaultPlace].latMax) return;
            if (lon < mapBounds.info[mapBounds.defaultPlace].lonMin) return;
            if (lon > mapBounds.info[mapBounds.defaultPlace].lonMax) return;
            //  let s = JSON.stringify(node);
            let s = JSON.stringify({ "lat": node.lat, "lon": node.lon, "tags": node.tags });
            nodeMap.set(node.id, node);
        },
        // way: function(way){
        //     console.log('way: ' + JSON.stringify(way));
        // },
        // relation: function(relation) {
        //     console.log("relation: " + JSON.stringify(relation));
        // },
        error: function(msg) {
            console.error("error: " + msg);
            throw msg;
        },
    });
}

function loadJSONMap(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

// Find all open street map *ways* that are within our bounds - needs nodes to be loaded first.
async function localFilterWays() {
    console.log("Generating file of local openstreetmaps 'ways'...");
    await osmread.parse({
        filePath: sourceOSMFileName,
        endDocument: function() {
            console.log("document end");
            console.log("ways: " + wayMap.size);
            if (!noCacheHack) {
                const localWays = JSON.stringify(Object.fromEntries(wayMap));
                fs.writeFileSync(localWaysFileName, localWays);
            }
            wait++;
        },
        way: function(way) {
            let nodeRefs = way.nodeRefs;
            let inBounds = true;
            for (const node of nodeRefs) {
                //if (!nodeMap.has(node)) inBounds = false;
                if (!nodeMap.has(node)) return;
            }
            //console.log("way: " + JSON.stringify(way));
            wayMap.set(way.id, way);
        },
        error: function(msg) {
            console.error("error: " + msg);
            throw msg;
        },
    });
}

function hasWordFromList(bigString, wordList) {
    for (const word of wordList) if (bigString.includes(word)) return true;
    return false;
}

// Find all OSM "nodes" and "ways" that have certain strings in them, excluding other strings.
// Write out the filtered list to a json file.
// nodeMap and wayMap have to already be loaded.
function extractPlaces(keywords, badWords, targetFile) {
    console.log("searching nodes for: " + keywords);
    console.log("excluding: " + badWords);
    let allPlaces = [];
    assert(nodeMap);
    assert(nodeMap.size > 0);
    for (const [id, val] of nodeMap) {
        let tagStr = JSON.stringify(val.tags).toLowerCase();
        if (hasWordFromList(tagStr, keywords)) {
            if (hasWordFromList(tagStr, badWords)) continue;
            let lat = parseFloat(val.lat);
            let lon = parseFloat(val.lon);
            if (val.tags.name) allPlaces.push([lat, lon, val.tags.name]);
        }
    }
    console.log("Searching ways...");
    assert(wayMap);
    assert(wayMap.size > 0);
    for (const [id, val] of wayMap) {
        let tagStr = JSON.stringify(val.tags).toLowerCase();
        if (hasWordFromList(tagStr, keywords)) {
            if (hasWordFromList(tagStr, badWords)) continue;
            // console.log(val.nodeRefs[0]);
            let reffed = nodeMap.get(val.nodeRefs[0]);
            // console.log(reffed);
            let lat = parseFloat(reffed.lat);
            let lon = parseFloat(reffed.lon);
            if (val.tags.name) allPlaces.push([lat, lon, val.tags.name]);
            // console.log(val);
        }
    }
    fs.writeFileSync("processedData/" + targetFile, JSON.stringify(allPlaces, null, "\t"));
    console.log("Wrote file: " + "processedData/" + targetFile);
}

async function doStuff() {
    // Filter out all nodes and ways from a certain area (lat/lon) and generate local ways and nodes files
    if (!fs.existsSync(localNodesFileName) || noCacheHack) await localFilterNodes();
    else wait++;
    if (!fs.existsSync(localWaysFileName) || noCacheHack) await localFilterWays();
    else wait++;

    while (wait < 2) {
        await sleep(1000);
        process.stdout.write(".");
    }
    console.log("");

    console.log("Loading local nodes and ways...");
    if (nodeMap.size <= 0) nodeMap = loadJSONMap(localNodesFileName);
    if (wayMap.size <= 0) wayMap = loadJSONMap(localWaysFileName);
    // prettier-ignore
    // Extract business locations
    extractPlaces(["department","office","business","parking","pharmacy","coffee","sandwich","deli","cafe","bank","shop","site","center","plaza","hotel","industr","store","auto","garage","museum","square","tower"],
                  ["garden"], mapBounds.defaultPlace + "_Businesses.json")
    extractPlaces(
        ["hospital", "medical center"],
        ["pet", "veterinary", "animal", "hospitality", "marijuana"],
        mapBounds.defaultPlace + "_Hospitals.json"
    );
    extractPlaces(["supermarket"], [], mapBounds.defaultPlace + "_Supermarkets.json");
}
doStuff();

// ------------------- Just for reference -------------------
let nodeExample = {
    id: "293632937",
    lat: 37.7767382,
    lon: -122.3942265,
    tags: {
        "addr:city": "San Francisco",
        "addr:housenumber": "298",
        "addr:postcode": "94107",
        "addr:street": "King Street",
        brand: "Safeway",
        "brand:wikidata": "Q1508234",
        "brand:wikipedia": "en:Safeway Inc.",
        designation: "Safeway 2606",
        name: "Safeway",
        opening_hours: "Su-Sa 05:00-24:00",
        ref: "2606",
        shop: "supermarket",
        website: "https://local.safeway.com/ca/san-francisco-2606.html",
        wheelchair: "yes",
    },
    version: 7,
    timestamp: 1566779175000,
    changeset: 0,
    uid: "0",
    user: "",
};

let wayExample = {
    "id": "6322990",
    "tags": {
        "highway": "residential",
        "tiger:cfcc": "A41",
        "tiger:tlid": "125073442",
        "tiger:county": "Alameda, CA",
        "tiger:source": "tiger_import_dch_v0.6_20070809",
        "tiger:reviewed": "no",
        "tiger:separated": "no",
        "tiger:upload_uuid": "bulk_upload.pl-9d5e179e-e488-4300-b71d-b0a82eacb273",
    },
    "nodeRefs": [
        "52998740",
        "52998743",
        "52998744",
        "52998746",
        "52998748",
        "52998750",
        "52998752",
        "52998753",
        "1667624566",
        "52998756",
    ],
    "version": 2,
    "timestamp": 1331315914000,
    "changeset": 0,
    "user": "",
};
