# YÆS: Yet Another Epidemic Simulator

## Building and running on localhost

First install dependencies:

```sh
npm install
```

To run in hot module reloading mode:

```sh
npm start
```

To create a production build:

```sh
npm run build-prod
```

## Utils and data files
Get northern california OpenStreetMaps data (norcal-latest.osm.pbf) here: http://download.geofabrik.de/north-america/us/california/norcal.html  
Use openstreetmapFilter.js to filter out the relevant region (lat/lon bounds set in code) and find buildings of interest, like businesses, hospitals, supermarkets.  

inside utils, run:
```sh
node openstreetmapFilter.js
```

Got Facebook population density maps here: https://data.humdata.org/dataset/united-states-high-resolution-population-density-maps-demographic-estimates  
Use QGIS software to export a layer inside of the lat/lon bounds.  
Use geotiff.js to export a people positions file from the population density data.  

San Francisco buildings data from here: https://data.sfgov.org/Housing-and-Buildings/Land-Use/us3s-fp9q

## Credits

Made with [createapp.dev](https://createapp.dev/)

