<template>
    <div class="center">
        <div class="grid-container">
            <div class="grid-item">
                <div style="height:52px;">
                    <span style="font-size:32px; padding:6px; color: #ff8811;display:inline-block"
                        ><strong>YÆS:</strong> Yet Another Epidemic Simulator</span
                    >
                    <span style="font-size:12px; padding:6px;padding-left:32px; color: #ff8811;display:inline-block"
                        >(Incomplete and not calibrated)</span
                    >
                </div>
                <div class="card">
                    <div style="position:relative">
                        <canvas
                            style="display:block;background-color:#123456;"
                            width="1024px"
                            height="768px"
                            id="map-canvas"
                            @click="clicked"
                            @wheel="mouseWheel"
                            @mousedown="handleMouseDown"
                            @mousemove="handleMouseMove"
                            @mouseup="handleMouseUp"
                            @touchstart="handleTouchStart"
                            @touchmove="handleTouchMove"
                            @touchend="handleTouchEnd"
                        ></canvas>
                        <label>
                            <select
                                style="position: absolute;top:8px;font-size:16px;background-color:#cceeff50;border:1px solid #ffffff80;border-radius: 10px;padding: 4px;margin-left: 8px;"
                                @change="changeCounty"
                            >
                                <option :value="null" hidden>Select County</option>
                                <option value="-1">None</option>
                                <option
                                    v-for="(countyName, index) in $mapBounds.info[$mapBounds.defaultPlace].includedCounties"
                                    v-bind:key="index"
                                    :value="index"
                                    >{{ countyName[0] + ", " + countyName[1] }}</option
                                >
                            </select>
                        </label>

                        <div class="vis" :class="visFlag(1)" style="top:40px" @mousedown.prevent="visToggle(1)">Pop / 10</div>
                        <div class="vis" :class="visFlag(2)" style="top:72px" @mousedown.prevent="visToggle(2)">Homes</div>
                        <div class="vis" :class="visFlag(4)" style="top:104px" @mousedown.prevent="visToggle(4)">Offices</div>
                        <div class="vis" :class="visFlag(8)" style="top:136px" @mousedown.prevent="visToggle(8)">Hospitals</div>
                        <div class="vis" :class="visFlag(16)" style="top:168px" @mousedown.prevent="visToggle(16)">
                            Supermarkets
                        </div>
                        <div class="vis" :class="visFlag(32)" style="top:232px" @mousedown.prevent="visToggle(32)">
                            Susceptible
                        </div>
                        <div class="vis" :class="visFlag(64)" style="top:264px" @mousedown.prevent="visToggle(64)">Infected</div>
                        <div class="vis" :class="visFlag(128)" style="top:296px" @mousedown.prevent="visToggle(128)">
                            Recovered
                        </div>
                        <div class="vis" :class="visFlag(256)" style="top:360px" @mousedown.prevent="visToggle(256)">Traces</div>
                        <div class="vis" :class="visFlag(512)" style="top:392px" @mousedown.prevent="visToggle(512)">Person</div>
                    </div>
                    <p style="margin:8px;">
                        <span
                            style="font-size:48px;float:left;margin:0px 16px;padding:0px;border:0px;background-color:#00000000;"
                            >{{
                                ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"][hoursElapsed % 12 | 0]
                            }}</span
                        >
                        <span style="display:inline-block"><button
                            type="button"
                            class=""
                            style="font-size:48px;float:left;margin:0px 16px;padding:0px;border:0px;background-color:#00000000;"
                            @click="fastForward"
                        >
                            ⏩
                        </button></span>
                        <span class="pulse-rep-block" style="display:inline-block"><button
                            type="button"
                            class=""
                            style="font-size:48px;float:left;margin:0px 16px;padding:0px;border:0px;background-color:#00000000;"
                            @click="playPause"
                        >
                            ⏯️
                        </button></span>
                        <span style="display:inline-block"><button
                            type="button"
                            class=""
                            style="font-size:48px;float:left;margin:0px 16px;padding:0px;border:0px;background-color:#00000000;"
                            @click="stepForward"
                        >
                            ⤵️
                        </button></span>
                        <span style="float:right"
                            >Sim Time (Milliseconds): {{ Math.round(milliseconds) }}, total 20 days:
                            {{ timerAccum.toFixed(0) }}</span
                        >
                    </p>
                </div>
                <div></div>

                <div class="card" style="margin-top:16px;margin-bottom:16px">
                    <div style="text-align:center;font-size:28px;margin-bottom:4px">
                        <span style="display:inline-block;">Disease Model Statistics (1000 samples)</span>
                    </div>
                    <table id="stats-table" style="width:100%">
                        <tr>
                            <th v-for="i in this.statsFields" v-bind:key="i">
                                {{ i }}
                            </th>
                        </tr>
                        <tr v-for="i in this.stats" v-bind:key="i.name">
                            <td @mouseover="statsHover(i.name, '')" @mouseleave="statsHover('')">{{ i.name }}</td>
                            <td @mouseover="statsHover(i.name, 'median')" @mouseleave="statsHover('')">
                                {{ i.median.toFixed(2) }}
                            </td>
                            <td @mouseover="statsHover(i.name, 'mean')" @mouseleave="statsHover('')">{{ i.mean.toFixed(2) }}</td>
                            <td @mouseover="statsHover(i.name, 'std')" @mouseleave="statsHover('')">{{ i.std.toFixed(2) }}</td>
                            <td @mouseover="statsHover(i.name, 'min')" @mouseleave="statsHover('')">{{ i.min.toFixed(2) }}</td>
                            <td @mouseover="statsHover(i.name, 'max')" @mouseleave="statsHover('')">{{ i.max.toFixed(2) }}</td>
                            <td @mouseover="statsHover(i.name, 'occurrence')" @mouseleave="statsHover('')">
                                {{ i.occurrence.toFixed(5) }}
                            </td>
                        </tr>
                    </table>

                    <canvas
                        style="display:block;background-color:#123456;margin:0px;padding:0px;border:0px"
                        width="1024px"
                        height="256px"
                        id="statistics-canvas"
                    ></canvas>
                </div>
            </div>
            <div class="grid-item">
                <div style="height:52px;">
                    <a href="https://github.com/otaviogood/EpidemicSim" target="_blank">
                        <img
                            style="position:relative;top:10px;float:right"
                            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyRpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpFNTE3OEEyQTk5QTAxMUUyOUExNUJDMTA0NkE4OTA0RCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpFNTE3OEEyQjk5QTAxMUUyOUExNUJDMTA0NkE4OTA0RCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOkU1MTc4QTI4OTlBMDExRTI5QTE1QkMxMDQ2QTg5MDREIiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOkU1MTc4QTI5OTlBMDExRTI5QTE1QkMxMDQ2QTg5MDREIi8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+m4QGuQAAAyRJREFUeNrEl21ojWEYx895TDPbMNlBK46IUiNmPvHBSUjaqc0H8pF5+aDUKPEBqU2NhRQpX5Rv5jWlDIWlMCv7MMSWsWwmb3tpXub4XXWdPHvc9/Gc41nu+nedc7/8r/99PffLdYdDPsvkwsgkTBwsA/PADJCnzX2gHTwBt8Hl7p537/3whn04XoDZDcpBlk+9P8AFcAghzRkJwPF4zGGw0Y9QS0mAM2AnQj77FqCzrtcwB1Hk81SYojHK4DyGuQ6mhIIrBWB9Xm7ug/6B/nZrBHBegrkFxoVGpnwBMSLR9EcEcC4qb8pP14BWcBcUgewMnF3T34VqhWMFkThLJAalwnENOAKiHpJq1FZgI2AT6HZtuxZwR9GidSHtI30jOrbawxlVX78/AbNfhHlomEUJJI89O2MqeE79T8/nk8nMBm/dK576hZgmA3cp/R4l9/UeSxiHLVIlNm4nFfT0bxyuIj7LHRTKai+zdJobwMKzcZSJb0ePV5PKN+BqAAKE47UlMnERELMM3EdYP/yrd+XYb2mOiYBiQ8OQnoRBlXrl9JZix7D1pHTazu4MoyBcnYamqAjIMTR8G4FT8LuhLsexXYYjICBiqhQBvYb6fLZIJCjPypVvaOoVAW2WcasCnL2Nq82xHJNSqlCeFcDshaPK0twkAhosjZL31QYw+1rlMpWGMArl23SBsZZO58F2tlJXmjOXS+s4WGvpMiBJT/I2PInZ6lIs9/hBsNS1hS6BG0DSqmYEDRlCXQrmy50P1oDRKTSegmNbUsA0zDMwRhPJXeCE3vWLPQMvan6X8AgIa1vcR4AkGZkDR4ejJ1UHpsaVI0g2LInpOsNFUud1rhxSV+fzC9Woz2EZkWQuja7/B+jUrgtIMpy9YCW4n4K41YfzRneW5E1KJTe4B2Zq1Q5EHEtj4U3AfEzR5SVY4l7QYQPJdN2as7RKBF0BPZqqH4VgMAMBL8Byxr7y8zCZiDlnOcEKIPmUpgB5Z2ww5RdOiiRiNajUmWda5IG6WbhsyY2fx6m8gLcoJDJFkH219M3We1+cnda93pfycZpIJEL/s/wSYADmOAwAQgdpBAAAAABJRU5ErkJggg=="
                            alt="Github logo"
                        />
                    </a>
                </div>

                <span style="display:inline-block;width:384px;float:right">
                    <!-- county info graph -->
                    <div class="card">
                        <div style="text-align:center;font-size:28px;margin-bottom:4px">📈 {{ county }}</div>
                        <canvas
                            style="display:block;background-color:#123456;margin-bottom:4px"
                            width="365px"
                            height="256px"
                            id="graph-canvas"
                        ></canvas>
                        <span class="stats" style="width:128px;display:inline-block">Hours: {{ hoursElapsed }}</span>
                        <span class="stats" style="width:120px;display:inline-block"
                            >Days: {{ Math.floor(hoursElapsed / 24) }}</span
                        >
                        <span class="stats" style="display:inline-block">{{ date }}</span>
                    </div>
                    <!-- Event & policy timeline -->
                    <div class="card" style="margin-top:16px">
                        <div style="width:365px;text-align:center;font-size:28px;">
                            <span style="display:inline-block;">📅 Events &amp; Policy Timeline</span>
                        </div>

                        <div class="scrolly" style="width:365px;height:124px;overflow:hidden; overflow-y:scroll;">
                            <div v-for="i in interventions" v-bind:key="i.time">
                                <div class="stats"><span v-html="i"></span></div>
                            </div>
                        </div>
                    </div>
                    <!-- Person info -->
                    <div class="card" style="margin-top:16px">
                        <div style="width:365px;text-align:center;font-size:28px;">
                            <span style="display:inline-block;">👤 Person info</span>
                            <label for="ticketNum">#</label>
                            <input
                                id="personIndex"
                                type="number"
                                value="0"
                                min="0"
                                style="width:80px;font-size:24px"
                                @change="changePersonIndex"
                            />
                        </div>

                        <div class="stats" style="font-size:10px">Day: <span v-html="person.routine"></span></div>
                        <div class="stats">Place: {{ person.location }}</div>
                        <div class="stats">Health: {{ person.status }}</div>
                        <div class="stats">Age: {{ person.age }}, {{ person.maleFemale == 0 ? "Male" : "Female" }}</div>
                        <div class="stats">asymptomatic overall? {{ person.asymptomaticOverall }}</div>
                        <div class="stats">Symptom level: {{ person.symptoms }}</div>
                        <div class="stats">Isolating? <span v-html="person.isolating"></span></div>
                        <div class="stats">
                            <canvas
                                style="display:block;background-color:#123456;margin:0px;padding:0px;border:0px"
                                width="365px"
                                height="32px"
                                id="timeline-canvas"
                            ></canvas>
                        </div>
                    </div>
                </span>
            </div>
            <div
                v-if="!loadedSim"
                style="position:absolute;top:calc(50% - 64px); left:calc(50% - 220px); background-color:#4680b0;color:white;font-size:96px;border-radius:64px;border:2px solid #cccccc;padding:24px"
            >
                Loading...
            </div>
        </div>

        <!-- license in the footer -->
        <p
            style="color:#bbbbbb;font-size:14px;"
            xmlns:dct="http://purl.org/dc/terms/"
            xmlns:vcard="http://www.w3.org/2001/vcard-rdf/3.0#"
        >
            <a rel="license" href="http://creativecommons.org/publicdomain/zero/1.0/">
                <img
                    src="https://licensebuttons.net/p/zero/1.0/80x15.png"
                    style="border-style: none;position:relative;top:3px"
                    alt="CC0"
                />
            </a>
            To the extent possible under law,
            <a rel="dct:publisher" href="https://github.com/otaviogood/EpidemicSim" target="_blank">
                <span property="dct:title">Otavio Good</span></a
            >
            has waived all copyright and related or neighboring rights to this work. This work is published from:
            <span property="vcard:Country" datatype="dct:ISO3166" content="US" about="https://github.com/otaviogood/EpidemicSim">
                United States</span
            >.
        </p>
    </div>
</template>

<script>
// <script lang="js">
import Vue from "vue";
import moment from "moment";
import { Spatial, Grid } from "./spatial";
import { Person, PlaceType } from "./person";
import { Sim } from "./sim";
import { TestPerson, StatsRecord } from "./test_person";
import { CountyStats, GraphType } from "./county-stats";
import * as Params from "./params";

Vue.prototype.$mapBounds = require("../utils/mapBounds");

let sim;
let params;
let tests;
export default Vue.extend({
    data: function() {
        return {
            animId: -1,
            hoursElapsed: 0,
            date: null,
            milliseconds: 0,
            timerAccum: 0,
            county: Vue.prototype.$mapBounds.info[Vue.prototype.$mapBounds.defaultPlace].includedCounties[0][0],
            person: {
                age: -1,
                maleFemale: -1,
                id: -1,
                location: "",
                status: "",
                asymptomaticOverall: false,
                symptoms: "",
                routine: "",
                timeSinceInfected: 0,
                isolating: "No",
            },
            interventions: [],
            stats: [],
            statsFields: [],
            mouse: {
                current: {
                    x: 0,
                    y: 0,
                },
                previous: {
                    x: 0,
                    y: 0,
                },
                down: false,
                mode: -1,
            },
            stepSize: 1,
            loadedSim: false,
            buttonHighlight: 0,
        };
    },
    created: function() {
        let self = this;
        self.animId = window.requestAnimationFrame(self.tickAnim);
    },
    destroyed() {
        window.cancelAnimationFrame(this.animId);
        this.animId = -1;
    },
    mounted: async function() {
        let self = this;
        params = new Params.SantaCruzModel();
        this.statsFields = StatsRecord.fields;
        tests = new TestPerson();
        tests.runTests(params);
        tests.drawHistogram(document.getElementById("statistics-canvas"));
        this.updateStats();
        sim = new Sim(params);
        await sim.setup();
        sim.paused = true;
        this.loadedSim = true;
        this.singleStepSim(); // Step 1 in so that things are setup
    },
    methods: {
        updateStats: function() {
            for (const stats of tests.allStats) this.stats.push(stats.makeMetricsObject(1.0 / 24.0));
        },
        updatePerson: function() {
            let self = this;
            let currentStep = sim.time_steps_since_start.getStepModDayOffset(-1); // Show results for timestep that just passed, not future timestep.
            let p = sim.pop[sim.selectedPersonIndex];
            let pTight = p.tight;
            self.person.timeSinceInfected = p.time_since_infected;
            self.person.asymptomaticOverall = !p.symptomaticOverall;
            self.person.isolating = p.isolating ? "<strong>YES</strong>" : "No";
            self.person.age = p.age;
            self.person.maleFemale = p.maleFemale;
            const icons = new Map([
                ["h", "🏡"],
                ["w", "🏢"],
                ["s", "🏪"],
                ["o", "🏥"],
                ["c", "🚗"],
                ["t", "🚂"],
            ]);
            const labels = new Map([
                ["h", "Home"],
                ["w", "Office"],
                ["s", ""], // Supermarket
                ["o", "Hospital"],
                ["c", "Car"],
                ["t", "Train"],
            ]);
            let act = pTight.getCurrentActivityChar(currentStep);
            // let act = p.currentActivity;
            let details = "";
            if (act == "h")
                details =
                    ", occupants " +
                    sim.allPlaces[PlaceType.home][pTight.placeIndex[PlaceType.home]].currentOccupants.length +
                    " / " +
                    sim.allPlaces[PlaceType.home][pTight.placeIndex[PlaceType.home]].residents.length;
            if (act == "s") details = sim.supermarketJSON[pTight.placeIndex[PlaceType.supermarket]][2];
            self.person.location = icons.get(act).toString() + " " + labels.get(act).toString() + details;
            self.person.routine = "";
            for (let i = 0; i < 24; i++) {
                if (i == currentStep)
                    self.person.routine +=
                        "<span style='background-color:#f41; height:18px;display:inline-block;border-radius:4px'>";
                self.person.routine += icons.get(pTight.getCurrentActivityChar(i)).toString();
                if (i == currentStep) self.person.routine += "</span>";
            }
            self.person.status = "🙂 Happily not sick";
            if (p.isSick) self.person.status = "🦠Sick";
            if (p.isContagious) self.person.status += ", ❗Contagious";
            if (p.isShowingSymptoms) self.person.status += ", 🥵Symptoms";
            if (p.isRecovered) self.person.status = "🥳 Recovered!";
            if (p.dead) self.person.status = "☠️ DEAD";
            if (p.symptomsCurrent == 0) self.person.symptoms = "None";
            else if (p.symptomsCurrent == 1) self.person.symptoms = "Mild";
            else if (p.symptomsCurrent == 2) self.person.symptoms = "Severe";
            else if (p.symptomsCurrent == 3) self.person.symptoms = "Critical";
            const canvas = document.getElementById("timeline-canvas");
            p.drawTimeline(canvas);
        },
        updateInterventions: function() {
            this.interventions = [];
            for (let i = 0; i < params.interventions.length; i++) {
                let temp = params.interventions[i];
                let expired = temp.time.raw < sim.time_steps_since_start.raw ? "<span class='pulse-block'>✔️" : "<span>";
                let actionStr = temp.action.toString();
                actionStr = actionStr.replace("function () {\n      return _this.", "").replace(";\n    }", ""); // A little hacky... :P
                if (temp.description) actionStr = temp.description;
                this.interventions.push(
                    expired +
                        "<span style='display:inline-block;width:60px;padding-right:12px;border-right:1px solid #cccccc'><strong>" +
                        temp.time.toMoment(params.startDate).format("MMM D") +
                        "</strong></span> " +
                        actionStr +
                        "</span>"
                );
            }
        },
        singleStepSim: function() {
            let self = this;
            let timer = performance.now();

            sim.run_simulation(this.stepSize);
            self.hoursElapsed = sim.time_steps_since_start.hours;
            self.date = moment(params.startDate)
                .add(sim.time_steps_since_start.hours, "h")
                .format("MMM D, HH:mm");

            if (sim.time_steps_since_start.raw > 0) {
                self.updatePerson();
            }
            self.updateInterventions();

            let t2 = performance.now();
            self.milliseconds = t2 - timer;
            if (sim.time_steps_since_start.days < 20) this.timerAccum += t2 - timer;
            sim.draw();
        },
        tickAnim: function() {
            let self = this;
            if (
                sim &&
                sim.pop.length > 0 &&
                (sim.countyStats.currentInfected() > 0 || sim.countyStats.totalInfected() == 0) &&
                !sim.paused
            ) {
                self.singleStepSim();
            }

            this.animId = window.requestAnimationFrame(() => self.tickAnim());
        },
        // x, y will be [0..1] range from upper left to lower right.
        controllerClick: function(event, x, y) {
            // If we're not actively dragging something, let people drag the phone screen.
            // if (this.mouse.mode != -1) event.preventDefault();
            // console.log(x.toString() + "   " + y.toString());
            sim.controllerClick(x, y);
        },

        clicked: function(event) {
            var rect = document.getElementById("map-canvas").getBoundingClientRect();
            this.controllerClick(
                event,
                (event.clientX - rect.left) / (rect.right - rect.left),
                (event.clientY - rect.top) / (rect.bottom - rect.top)
            );
        },
        changeCounty: function(e) {
            sim.selectedCountyIndex = parseInt(e.target.value);
            let countyInfo =
                Vue.prototype.$mapBounds.info[Vue.prototype.$mapBounds.defaultPlace].includedCounties[
                    Math.max(0, sim.selectedCountyIndex)
                ];
            this.county = countyInfo[0];
            sim.draw();
        },
        changePersonIndex: function(e) {
            sim.selectedPersonIndex = e.target.valueAsNumber;
            this.updatePerson();
            sim.draw();
        },
        visToggle: function(flag) {
            sim.visualsFlag ^= flag;
            this.buttonHighlight = sim.visualsFlag;
            sim.draw();
        },
        visFlag: function(flag) {
            if (!sim) return false;
            this.buttonHighlight = sim.visualsFlag;
            return (this.buttonHighlight & flag) != 0 ? "highlight" : "";
        },
        statsHover: function(name, col) {
            tests.selected = name;
            tests.selectedStat = col;
            tests.drawHistogram(document.getElementById("statistics-canvas"));
        },
        mouseWheel: function(event) {
            event.preventDefault();
            sim.changeZoom(Math.sign(event.deltaY));
        },
        playPause: function(event) {
            this.stepSize = 1;
            sim.playPause();
        },
        fastForward: function(event) {
            this.stepSize = 24;
            sim.playPause();
        },
        stepForward: function(event) {
            this.stepSize = 1;
            this.singleStepSim();
        },

        controllerDown: function(event, x, y) {
            this.mouse.down = true;
            this.mouse.current = {
                x: x,
                y: y,
            };
            // this.mouse.mode = -1;
            this.mouse.mode = 0;
            // If we're not actively dragging something, let people drag the phone screen.
            if (this.mouse.mode != -1) event.preventDefault();
        },
        controllerUp: function(event) {
            if (this.mouse.mode != -1) event.preventDefault();
            this.mouse.down = false;
        },
        controllerMove: function(event, x, y) {
            if (this.mouse.mode != -1) event.preventDefault();
            this.mouse.previous = this.mouse.current;
            this.mouse.current = {
                x: x,
                y: y,
            };
            if (this.mouse.down) {
                if (this.mouse.mode == 0) {
                    sim.translation(this.mouse.previous.x - this.mouse.current.x, this.mouse.previous.y - this.mouse.current.y);
                    // sim.centerx -= this.mouse.previous.x - this.mouse.current.x;
                    // sim.centery -= this.mouse.previous.y - this.mouse.current.y;
                    sim.draw();
                }
            }
        },

        handleMouseDown: function(event) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            this.controllerDown(
                event,
                ((event.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((event.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },
        handleMouseUp: function(event) {
            this.controllerUp(event);
        },
        handleMouseMove: function(event) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            this.controllerMove(
                event,
                ((event.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((event.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },

        handleTouchStart: function(event) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            let touch = event.changedTouches[0];
            this.controllerDown(
                event,
                ((touch.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((touch.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },
        handleTouchEnd: function(event) {
            this.controllerUp(event);
        },
        handleTouchMove: function(event) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            let touch = event.changedTouches[0];
            this.controllerMove(
                event,
                ((touch.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((touch.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },
    },
});
</script>

<style>
h2 {
    font-family: sans-serif, Arial;
    color: #ff8811;
}
body {
    font-family: sans-serif, Arial;
    font-size: 16px;
    margin: 0px;
}
.card {
    display: inline-block;
    border: 1px solid #aaaaaa;
    padding: 8px;
    background-color: #e0e0e0;
    border-radius: 8px;
}
.clearfix {
    content: "";
    clear: both;
    display: table;
}
.stats {
    border-top: 1px solid #cccccc;
    padding-top: 4px;
    padding-bottom: 4px;
}
.pulse-block {
    animation-name: pulse-anim;
    animation-duration: 4s;
    animation-fill-mode: forwards;
    border: 2px solid #00ff00ff;
}

@keyframes pulse-anim {
    from {
        border-color: #00ff00ff;
    }
    to {
        border-color: #ffffff00;
    }
}

.pulse-rep-block {
    animation-name: pulse-rep-anim;
    animation-duration: 0.5s;
    animation-iteration-count: 5;
    animation-fill-mode: forwards;
    background-color: #ff000000;
}
@keyframes pulse-rep-anim {
    0% {
        background-color: #ff000000;
    }
    50% {
        background-color: #ffcc00ff;
    }
    100% {
        background-color: #ff000000;
    }
}

.vis {
    position: absolute;
    top: 0px;
    color: white;
    background-color: #00000040;
    border-radius: 10px;
    padding: 5px;
    margin-left: 8px;
    cursor: default;
}
.vis:hover {
    background-color: #23507880;
    color: white;
    cursor: default;
}
.highlight {
    cursor: default;
    border: 1px solid #f2bb07;
}
table#stats-table,
th,
td {
    border: 1px solid #d0d0d0;
    border-collapse: collapse;
    padding: 4px;
    background-color: #fff8e8;
}
table td:hover {
    color: #ffffff;
    background-color: #123456;
}

.grid-container {
    display: grid;
    grid-template-columns: auto 392px;
}

.grid-item {
    /* border: 1px solid rgba(0, 0, 0, 0.8); */
}
.center {
    margin: auto;
    max-width: 1440px;
    /* border: 1px solid #123456;
  padding: 10px; */
}
a {
    color: #88ccff;
}
</style>
