"use strict";

const defaultPlace = "santaCruz";

const info = {
    "sfCityLimits": {
        "mapImage": "sf_map_osm_hi.jpg",
        "includedCounties": [["San Francisco County", "CA"]], // First county in the list will be default
    },
    "santaCruz": {
        "mapImage": "santaCruz_map.jpg",
        "includedCounties": [
            ["Santa Cruz County", "CA"],
            // ["Santa Clara County", "CA"],
        ],
    },
    "sfBayArea": {
        "mapImage": "ba_map_osm_hi.jpg",
        "includedCounties": [
            ["Alameda County", "CA"],
            ["Contra Costa County", "CA"],
            ["Marin County", "CA"],
            ["Napa County", "CA"],
            ["San Francisco County", "CA"],
            ["San Mateo County", "CA"],
            ["Santa Clara County", "CA"],
            ["Solano County", "CA"],
            ["Sonoma County", "CA"],
        ],
    },
};

module.exports = { info, defaultPlace };
