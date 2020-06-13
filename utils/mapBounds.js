"use strict";

const defaultPlace = "santaCruz";

const info = {
    "sfCityLimits": {
        "mapImage": "sf_map_osm_hi.jpg",
        "includedCounties": [["San Francisco County", "CA"]],
    },
    "santaCruz": {
        "mapImage": "santaCruz_map.jpg",
        "includedCounties": [["Santa Cruz County", "CA"]],
    },
    "sfBayArea": {
        "mapImage": "sfBayArea_map.png",
        "includedCounties": [
            ["Alameda County", "CA"], // First county in the list will be default
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
