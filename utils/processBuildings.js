"use strict";
var assert = require("assert");
const fs = require("fs");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);
var turf = require("@turf/turf");
const papa = require("papaparse");
var stringify = require("json-stable-stringify-without-jsonify");
var flatbuffers = require("flatbuffers").flatbuffers;
var FlatbufPlaces = require("./flatbuffers/households_generated").Flatbuf; // Generated by flatc compiler.

const misc = require("./misc");
const countyInfo = require("./countyUtils");
const mapBounds = require("./mapBounds");

let houseHoldFile = "processedData/" + mapBounds.defaultPlace + "_Households.json";
let officeFile = "processedData/" + mapBounds.defaultPlace + "_Offices.json";
let countyPolygonsFile = "processedData/" + mapBounds.defaultPlace + "_CountyPolygons.json";

async function doEverything() {
    let countyStuff = new countyInfo.CountyInfo();
    await countyStuff.readAllCountiesCensus();
    console.log(countyStuff.censusInfo);
    // -------------------- Households --------------------
    let buildingPositionsJSON = JSON.parse(
        fs.readFileSync("processedData/" + mapBounds.defaultPlace + "_BuildingPositions.json", "utf8")
    );
    // Randomize the array so that statistical tricks downstream from here will work well.
    misc.shuffleArrayInPlace(buildingPositionsJSON, rand);

    // Append the county ID onto each location in the list.
    buildingPositionsJSON = await countyStuff.tagListWithCountyIndexAndFilter(buildingPositionsJSON);

    // Count the populations per county from the facebook population density data
    // so that we can correct it to match the census data.
    let numCounties = mapBounds.info[mapBounds.defaultPlace].includedCounties.length;
    let countyPopsInitial = Array(numCounties).fill(0);
    for (let i = 0; i < buildingPositionsJSON.length; i++) {
        let posAndCount = buildingPositionsJSON[i];
        let lat = posAndCount[0];
        let lon = posAndCount[1];
        let count = posAndCount[2];
        let countyIndex = posAndCount[posAndCount.length - 1];
        countyPopsInitial[countyIndex] += count;
    }
    console.log("county populations initial: ");
    console.log(countyPopsInitial);

    // Figure out the multiplier for each county that will correct the population to match the census.
    let multipliers = Array(numCounties).fill(0);
    for (let i = 0; i < numCounties; i++) {
        multipliers[i] = countyStuff.censusInfo.get(i).get("population") / countyPopsInitial[i];
    }
    console.log("Multipliers: " + multipliers);

    // Make an array of households that are the right size
    let households = [];
    let avgHouseholdSize = 0;
    let population = 0;
    for (let i = 0; i < buildingPositionsJSON.length; i++) {
        let posAndCount = buildingPositionsJSON[i];
        let lat = posAndCount[0];
        let lon = posAndCount[1];
        let count = posAndCount[2];
        let countyIndex = posAndCount[posAndCount.length - 1];
        count *= misc.roundRandom(rand, multipliers[countyIndex]);
        population += count;
        let targetHouseholdSize = countyStuff.censusInfo.get(countyIndex).get("personsPerHousehold");
        while (count > 0) {
            let rsize = 4;
            // This will keep a running total of household size and make it bigger or smaller depending
            // on if we are above or below our target. Sorta messy, but it seems to work.
            if ((avgHouseholdSize * 1.0) / households.length > targetHouseholdSize) rsize = 1;
            let r = rand.random_int31() % 3;
            if (r == 0) rsize += rand.random_int31() & 7; //  crappy distribution so we get some bigger houses
            let capacity = Math.min(count, rsize);
            // households.push(new misc.SimplePlace(lat, lon, capacity, countyIndex));
            households.push([lat, lon, capacity, countyIndex]);
            avgHouseholdSize += capacity;
            count -= capacity;
        }
    }
    console.log("Average household size: " + ((avgHouseholdSize * 1.0) / households.length).toFixed(2));
    console.log("Adjusted Population: " + population);

    // ---- Build the flatbuffer of places ----
    // var builder = new flatbuffers.Builder(households.length);
    // let allSimplePlaces = [];
    // for (let i = 0; i < households.length; i++) {
    //     let p = households[i];
    //     let simplePlace = FlatbufPlaces.SimplePlace.createSimplePlace(builder, p.lat, p.lon, p.capacity, p.countyIndex, 0);
    //     allSimplePlaces.push(simplePlace);
    // }
    // let allPlacesOffset = FlatbufPlaces.PlaceArray.createPlaceVector(builder, allSimplePlaces);
    // builder.finish(FlatbufPlaces.PlaceArray.createPlaceArray(builder, allPlacesOffset, avgHouseholdSize));
    // fs.writeFileSync("processedData/" + mapBounds.defaultPlace + "_Households.fb", builder.asUint8Array(), { encoding: null });

    fs.writeFileSync(houseHoldFile, stringify(households, null, "\t"));

    fs.writeFileSync(countyPolygonsFile, stringify(Object.fromEntries(countyStuff.relevantCountyPolygons)));

    // -------------------- Offices --------------------
    let businessesJSON = JSON.parse(fs.readFileSync("processedData/" + mapBounds.defaultPlace + "_Businesses.json", "utf8"));
    misc.shuffleArrayInPlace(businessesJSON, rand);

    // Append the county ID onto each location in the list.
    businessesJSON = await countyStuff.tagListWithCountyIndexAndFilter(businessesJSON);

    // Offices are approximated, so just make more until we have an office for most people.
    // TODO: this is a bit arbitrary... look into more representative numbers.
    let multiplier = 3;
    let offices = [];
    let avgOfficeSize = 0;
    let totalOffices = 0;
    for (let i = 0; i < businessesJSON.length; i++) {
        let posAndName = businessesJSON[i];
        let lat = posAndName[0];
        let lon = posAndName[1];
        let countyIndex = posAndName[posAndName.length - 1];
        if (countyIndex == -1) continue;
        for (let i = 0; i < multiplier; i++) {
            let capacity = (Math.pow(rand.random(), 2.0) * 55 + 1) | 0; // skew distribution to smaller businesses
            offices.push([lat, lon, capacity, countyIndex]);
            avgOfficeSize += capacity;
            totalOffices++;
        }
    }
    let totalOfficeSeats = avgOfficeSize;
    avgOfficeSize /= 1.0 * totalOffices;

    console.log("Average office size: " + avgOfficeSize);
    console.log("Total offices: " + totalOffices);
    console.log("Total office Seats: " + totalOfficeSeats);

    fs.writeFileSync(officeFile, stringify(offices, null, "\t"));
}

doEverything();
