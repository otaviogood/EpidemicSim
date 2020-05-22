<template>
    <div>
        <div style="font-size:32px; padding:12px; color: #ff8811;"><strong>YÆS:</strong> Yet Another Epidemic Simulator</div>
        <span class="card" style="float:right;">
            <canvas
                style="display:block;background-color:#123456;margin-bottom:4px"
                width="365px"
                height="256px"
                id="graph-canvas"
            ></canvas>
            <span style="background-color:#ffcf5f;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Total Infected: {{ totalInfected }}</strong
            ><br />
            <span style="background-color:#ffffff;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Currently Infected: {{ currentlyInfected }}</strong
            ><br />
            <span style="background-color:#ff3711;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Total dead: {{ totalDead }}</strong
            ><br />
            <hr />
            <span style="width:180px;display:inline-block">Hours: {{ hoursElapsed }}</span>
            Days: {{ Math.floor(hoursElapsed / 24) }}<br />
        </span>
        <span class="card clearfix" style="float:right;margin-top:16px">
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
        </span>
        <span class="card clearfix" style="float:right;margin-top:16px">
            <div style="width:365px;text-align:center;font-size:28px;">
                <span style="display:inline-block;">Interventions</span>
            </div>

            <div class="scrolly" style="width:365px;height:124px;overflow:hidden; overflow-y:scroll;">
                <div v-for="i in interventions" v-bind:key="i.time">
                    <div class="stats">T <span v-html="i"></span></div>
                </div>
            </div>
        </span>
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
                <div class="mapkey" style="top:8px" @mouseover="mapkeyHover(1)" @mouseleave="mapkeyHover(0)">Pop / 10</div>
                <div class="mapkey" style="top:40px" @mouseover="mapkeyHover(2)" @mouseleave="mapkeyHover(0)">Offices</div>
                <div class="mapkey" style="top:72px" @mouseover="mapkeyHover(4)" @mouseleave="mapkeyHover(0)">Hospitals</div>
                <div class="mapkey" style="top:104px" @mouseover="mapkeyHover(8)" @mouseleave="mapkeyHover(0)">Supermarkets</div>
                <div class="mapkey" style="top:160px" @mouseover="mapkeyHover(16)" @mouseleave="mapkeyHover(0)">Susceptible</div>
                <div class="mapkey" style="top:192px" @mouseover="mapkeyHover(32)" @mouseleave="mapkeyHover(0)">Infected</div>
                <div class="mapkey" style="top:224px" @mouseover="mapkeyHover(64)" @mouseleave="mapkeyHover(0)">Recovered</div>
            </div>
            <p style="margin:8px;">
                <span style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;">{{
                    ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"][hoursElapsed % 12 | 0]
                }}</span>
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
                <span style="float:right">Sim Time (Milliseconds): {{ Math.round(milliseconds) }}</span>
            </p>
        </span>
    </div>
</template>

<script lang="js">
import Vue from "vue";
import { Spatial, Grid } from "./spatial";
import { Person, ActivityType } from "./person";
import { Sim } from "./sim";
import { runTests } from "./test_person";
import * as Params from "./params";

let sim;//: Sim;
let params;//: Params.Base;
export default Vue.extend({
    data: function() {
        return {
            animId: -1,
            hoursElapsed: 0,
            currentlyInfected: 0,
            totalInfected: 0,
            milliseconds: 0,
            totalDead: 0,
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
        params = new Params.Base();
        runTests(params);
        sim = new Sim(params);
        await sim.setup();
        sim.paused = true;
    },
    methods: {
        updatePerson: function() {
            let self = this;
            let currentHour = sim.time_steps_since_start % 24;
            let p = sim.pop.index(sim.selectedPersonIndex);
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
            let act = p.getCurrentActivity(currentHour);
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
        singleStepSim: function() {
            let self = this;
            let timer = performance.now();

            sim.run_simulation(1);
            self.hoursElapsed = sim.time_steps_since_start;
            self.currentlyInfected = sim.numActive;
            self.totalInfected = sim.totalInfected;
            self.totalDead = sim.totalDead;

            if (sim.time_steps_since_start > 0) {
                self.updatePerson();
            }
            self.interventions = [];
            for (let i = 0; i < params.interventions.length; i++) {
                let temp = params.interventions[i];
                let actionStr = temp.action.toString();
                actionStr = actionStr.replace("function () {\n      return _this.", "").replace(";\n    }", "");  // A little hacky... :P
                self.interventions.push("<strong>" + temp.time.toString() + "</strong> &nbsp;&nbsp;&nbsp;" + actionStr);
            }

            let t2 = performance.now();
            self.milliseconds = t2 - timer;
            sim.draw();
        },
        tickAnim: function() {
            let self = this;
            if (sim && sim.numActive > 0 && !sim.paused) {
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
        changePersonIndex: function(e) {
            sim.selectedPersonIndex = e.target.valueAsNumber;
            this.updatePerson();
            sim.draw();
        },
        mapkeyHover: function(flag) {
            sim.visualsFlag = flag;
            sim.draw();
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
    background-color: #cceeff;
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
    animation-duration: 5s;
    animation-fill-mode: forwards;
    border: 4px solid #ff0000ff;
}

@keyframes pulse-anim {
    from {
        border-color: #ff0000ff;
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
    background-color: #cceeff;
    color: #000000;
    cursor: default;
}
</style>
