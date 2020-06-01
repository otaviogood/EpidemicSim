<template>
    <div>
        <div style="font-size:32px; padding:6px; color: #ff8811;"><strong>YÆS:</strong> Yet Another Epidemic Simulator</div>
        <span style="display:inline-block">
            <span class="card">
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
                                v-for="(countyName, id) in $mapBounds.info[$mapBounds.defaultPlace].includedCounties"
                                v-bind:key="id"
                                :value="id"
                                >{{ countyName }}</option
                            >
                        </select>
                    </label>

                    <div
                        class="mapkey"
                        :class="visualsFlag(1) ? 'highlight' : ''"
                        style="top:40px"
                        @mousedown.prevent="mapkeyHover(1)"
                    >
                        Pop / 10
                    </div>
                    <div class="mapkey" style="top:72px" @mousedown.prevent="mapkeyHover(2)">Homes</div>
                    <div class="mapkey" style="top:104px" @mousedown.prevent="mapkeyHover(4)">Offices</div>
                    <div class="mapkey" style="top:136px" @mousedown.prevent="mapkeyHover(8)">Hospitals</div>
                    <div class="mapkey" style="top:168px" @mousedown.prevent="mapkeyHover(16)">Supermarkets</div>
                    <div class="mapkey" style="top:232px" @mousedown.prevent="mapkeyHover(32)">Susceptible</div>
                    <div class="mapkey" style="top:264px" @mousedown.prevent="mapkeyHover(64)">Infected</div>
                    <div class="mapkey" style="top:296px" @mousedown.prevent="mapkeyHover(128)">Recovered</div>
                </div>
                <p style="margin:8px;">
                    <span
                        style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                        >{{
                            ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"][hoursElapsed % 12 | 0]
                        }}</span
                    >
                    <button
                        type="button"
                        class=""
                        style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                        @click="playPause"
                    >
                        ⏯️
                    </button>
                    <button
                        type="button"
                        class=""
                        style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                        @click="stepForward"
                    >
                        ⤵️
                    </button>
                    <span style="float:right"
                        >Sim Time (Milliseconds): {{ Math.round(milliseconds) }}, total 20 days: {{ timerAccum.toFixed(0) }}</span
                    >
                </p></span
            ></span
        ><span style="display:inline-block;width:384px;float:right"
            ><div class="card">
                <div style="text-align:center;font-size:28px;margin-bottom:4px">📈 {{ county }}</div>
                <canvas
                    style="display:block;background-color:#123456;margin-bottom:4px"
                    width="365px"
                    height="256px"
                    id="graph-canvas"
                ></canvas>
                <span class="stats" style="width:128px;display:inline-block">Hours: {{ hoursElapsed }}</span>
                <span class="stats" style="width:120px;display:inline-block">Days: {{ Math.floor(hoursElapsed / 24) }}</span>
                <span class="stats" style="display:inline-block">{{ date }}</span>
            </div>
            <div class="card" style="margin-top:16px">
                <div style="width:365px;text-align:center;font-size:28px;">
                    <span style="display:inline-block;">Person info</span>
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

                <div class="stats" style="font-size:10px">Day: {{ person.routine }}</div>
                <div class="stats">Location: {{ person.location }}</div>
                <div class="stats">Health: {{ person.status }}</div>
                <div class="stats">Age (TODO): {{ person.age }}</div>
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
            <div class="card" style="margin-top:16px">
                <div style="width:365px;text-align:center;font-size:28px;">
                    <span style="display:inline-block;">Policy Timeline</span>
                </div>

                <div class="scrolly" style="width:365px;height:124px;overflow:hidden; overflow-y:scroll;">
                    <div v-for="i in interventions" v-bind:key="i.time">
                        <div class="stats"><span v-html="i"></span></div>
                    </div>
                </div>
            </div>
        </span>
        <span class="card" style="margin-top:16px;margin-bottom:16px">
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
                    <td @mouseover="statsHover(i.name, 'median')" @mouseleave="statsHover('')">{{ i.median.toFixed(2) }}</td>
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
        </span>
    </div>
</template>

<script>
// <script lang="js">
import Vue from "vue";
import moment from "moment";
import { Spatial, Grid } from "./spatial";
import { Person, ActivityType } from "./person";
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
            county: Vue.prototype.$mapBounds.info[Vue.prototype.$mapBounds.defaultPlace].includedCounties[0],
            person: {
                age: -1,
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
        params = new Params.DeadlyModel();
        this.statsFields = StatsRecord.fields;
        tests = new TestPerson();
        tests.runTests(params);
        tests.drawHistogram(document.getElementById("statistics-canvas"));
        this.updateStats();
        sim = new Sim(params);
        await sim.setup();
        sim.paused = true;
    },
    methods: {
        updateStats: function() {
            for (const stats of tests.allStats) this.stats.push(stats.makeMetricsObject(1.0 / 24.0));
        },
        updatePerson: function() {
            let self = this;
            let currentStep = sim.time_steps_since_start.getStepModDay(); // % 24;
            let p = sim.pop[sim.selectedPersonIndex];
            self.person.timeSinceInfected = p.time_since_infected;
            self.person.asymptomaticOverall = !p.symptomaticOverall;
            self.person.isolating = p.isolating ? "<strong>YES</strong>" : "No";
            // self.person.age = p.age;
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
                ["s", "Supermarket"],
                ["o", "Hospital"],
                ["c", "Car"],
                ["t", "Train"],
            ]);
            let act = p.getCurrentActivity(currentStep);
            self.person.location = icons.get(act).toString() + " " + labels.get(act).toString();
            self.person.routine = "";
            for (let i = 0; i < 24; i++) {
                self.person.routine += icons.get(p.getCurrentActivity(i)).toString();
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
                        "<strong>" +
                        temp.time.toMoment(params.startDate).format("MMM D") +
                        "</strong> &nbsp;&nbsp;&nbsp;" +
                        actionStr +
                        "</span>"
                );
            }
        },
        singleStepSim: function() {
            let self = this;
            let timer = performance.now();

            sim.run_simulation(1);
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
            if (sim && sim.countyStats.numInfected() > 0 && !sim.paused) {
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
            this.county =
                Vue.prototype.$mapBounds.info[Vue.prototype.$mapBounds.defaultPlace].includedCounties[
                    Math.max(0, sim.selectedCountyIndex)
                ];
            sim.draw();
        },
        changePersonIndex: function(e) {
            sim.selectedPersonIndex = e.target.valueAsNumber;
            this.updatePerson();
            sim.draw();
        },
        mapkeyHover: function(flag) {
            sim.visualsFlag ^= flag;
            sim.draw();
        },
        visualsFlag: function(flag) {
            if (!sim) return false;
            return (sim.visualsFlag & flag) != 0;
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
            sim.playPause();
        },
        stepForward: function(event) {
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

.mapkey {
    position: absolute;
    top: 0px;
    color: white;
    background-color: #00000040;
    border-radius: 10px;
    padding: 5px;
    margin-left: 8px;
    cursor: default;
}
.mapkey:hover {
    background-color: #23507880;
    color: white;
    cursor: default;
}
.highlight {
    background-color: #e0e0e0;
    color: #000000;
    cursor: default;
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
</style>
