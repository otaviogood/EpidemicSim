
#include <string>
#include <vector>
#include <list>
#include <map>
#include <cstdlib>
#include <cassert>
#include <stdexcept>
#include <iostream>
#include <cmath>
#include <algorithm>
#include <random>
#include <stdlib.h>

#if __has_include(<emscripten/bind.h>)
#include <emscripten/bind.h>
#include <emscripten/val.h>
#define HAS_EMSCRIPTEN 1
#else
#define HAS_EMSCRIPTEN 0
#endif

#include "random_fast.cc"

// constructor in global namespace. 
// TODO: a huge vector of char[24] skips a pointer indirection.
std::vector<std::string> activitiesNormal;
std::vector<std::string> activitiesWhileSick;
static int verbose = 0;

extern "C" {
    extern void example_javascript_c_api(int z);
}

namespace EpidemicSimCore {

    void util_assert(bool condition, const std::string& msg = "") {
        //assert(condition);
        if (!condition) {
            printf("ERROR: %s\n", msg.c_str());
        }
    }

#define PERSON_MAX_PLACE_TYPES 3

    enum SymptomsLevels {
        // 0 none, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
        none = 0,
        mild = 1,
        severe = 2,
        critical = 3,
    };

    enum class ActivityType {
        home = 'h',
        work = 'w',
        shopping = 's',
        hospital = 'o',
        car = 'c',
        train = 't'
    };

    struct PersonCore;
    struct OccupantCounter;
    struct Sim;

#define USE_RANDOM_FAST 1
#if USE_RANDOM_FAST
    struct RNG {
        RandomFast r;
        typedef int seed_int_t;
        // 0..1
        float random() {
            return r.RandFloat();
        }

        int hash_int_approx(seed_int_t seed, int from, int to_exclusive) {
            return r.HashIntApprox(seed, from, to_exclusive);
        }

        int rand_int_approx(int from, int to_exclusive) {
            return r.RandIntApprox(from, to_exclusive);
        }

        RNG() : r(1234567890) {

        }
    };
#else
    struct RNG {
        // 0..1
        float random() {
            return m_distribution(m_generator);
        }

        int random_int(int a, int b) {
            std::uniform_int_distribution<int> distribution(a, b-1);
            return distribution(m_generator);
        }

        int hash_int_approx(int seed, int from, int to_exclusive) {
            return random_int(from, to_exclusive+1);
        }

        std::random_device rd;
        std::unique_ptr<std::mt19937> e2;

        RNG() : m_generator(std::random_device()()),
            m_distribution(0.0f, 1.0f) {
        }

    private:
        std::random_device m_seed;
        std::mt19937 m_generator;
        std::uniform_real_distribution<float> m_distribution;
    };
#endif

    struct TimeStep {
        static const int stepsInDay = 24;
        // This needs to be an integer.
        int64_t time = 0;

        TimeStep(int64_t t0) : time(t0) {
        }

        int getStepModDay() {
            return time % TimeStep::stepsInDay;
        }
    };

    // As small as possible. Lots of memory jumps
    struct PersonPlaceOnly {
        int placeIndex[PERSON_MAX_PLACE_TYPES];
        short activityIndex = 0;
        bool isolating = false; // TODO: sync with PersonCore

        PersonPlaceOnly(const PersonCore& p);

        char getActivity(int hour) const {
            if (isolating) {
                return activitiesWhileSick[0][hour];
            }
            else {
                return activitiesNormal[activityIndex][hour];
            }
        }
    };

    struct OccupantCounter {
        Sim* sim = nullptr;
        std::vector<PersonPlaceOnly> personPlaceInfo;

        OccupantCounter(Sim* sim, int nPersons);
        int getOccupantCount(const std::string& activityType, int index) const;
        void countOnly(int hour);
        void countAndFillLists(int hour);
        std::vector<unsigned int> getNRandomOccupants(RNG::seed_int_t seed, const std::string& activityType, int index, int count);
        std::vector<unsigned int> getOccupants(const std::string& activityType, int index);
        void prepare();

    private:
        // counts and optionally fills lists
        template<bool fillLists>
        void doCount(int hour);
    };

    struct Sim {

        // all hospitals, etc
        struct PlaceSet {
            char activityType = 'h';
            std::vector<int> occupantCount;
            std::vector<std::vector<unsigned int>> occupantList;
            std::vector<std::vector<unsigned int>> residentsList;
        };

        struct params_t {
            float prob_baseline_timestep = 0.005f;
        };

        RNG rng;
        int totalDead = 0;
        int totalInfected = 0;
        params_t params;
        OccupantCounter* occupantCounter;

        OccupantCounter* getOccupantCounter() {
            return occupantCounter;
        }

        std::vector<PlaceSet> placesByType;
        std::map<char, int> activityToPlaceSetIndex;
        std::map<char, float> activityDensity;

        Sim(int nPersons);
        ~Sim();

        static void registerNormalActivitySchedule(const std::string& activityScheduleString);
        static void registerSickActivitySchedule(const std::string& activityScheduleString);
        void setNumberOfPlacesForActivity(const std::string& activityType_s, int count, float density);

        void addPerson(const PersonCore& p);
        void updatePersonIsolating(int personId, bool sickMode);
        void prepare();
        void runPopulationStep(unsigned int time_steps_since_start);
        void becomeSick(int index);

        std::vector<unsigned int> lastStepInfected;
        std::vector<unsigned int> lastStepRecovered;
        std::vector<unsigned int> lastStepDead;

        PersonCore* getPerson(int index) {
            return &persons[index];
        }

        size_t personsCount() const {
            return persons.size();
        }

    private:
        std::vector<PersonCore> persons;
    };




    // This could be embedded inside the javascript person object, to avoid duplication of code and data. 
    // Just essential topology data, like this person's places indices.
    struct PersonCore {
        int placeIndex[PERSON_MAX_PLACE_TYPES];
        int activityIndex = 0;

        unsigned int id = 0; // TODO: uint enough?
        int time_since_infected = 0;
        // These are times of onset of various things
        int contagiousTrigger = INT32_MAX;
        int endContagiousTrigger = INT32_MAX;
        int symptomsTrigger = INT32_MAX;
        int endSymptomsTrigger = INT32_MAX;
        int deadTrigger = INT32_MAX;
        int severeTrigger = INT32_MAX;
        int isolationTrigger = INT32_MAX; // That moment they decide they are sick af and they need to isolate better (Any data for this???)
        int symptomsCurrent = SymptomsLevels::none;
        
        bool recovered = false;
        bool dead = false;
        bool contagious = false;
        bool symptomaticOverall = true;
        bool isolating = false;
        bool criticalIfSevere = false;
        bool infected = false;

        PersonCore(unsigned int id, const std::vector<int>& placeIndexes, int activityIndex)
            : id(id), activityIndex(activityIndex) {
            if (placeIndexes.size() > PERSON_MAX_PLACE_TYPES) throw std::runtime_error("overflow: placeIndexes larger than PERSON_MAX_PLACE_TYPES");
            memset(placeIndex, 0, sizeof(placeIndex));
            for (size_t i = 0; i < placeIndexes.size(); i++) {
                placeIndex[i] = placeIndexes[i];
            }
        }

        char getActivity(int hour) const {
            if (isolating) {
                return activitiesWhileSick[0][hour];
            }
            else {
                return activitiesNormal[activityIndex][hour];
            }
        }

        bool stepTime(Sim* sim, RNG& rand);
        void spread(long long int time_steps_since_start, int index, std::vector<PersonCore>& pop, RNG& rand, Sim& sim);

        void becomeSick(Sim* sim);
        void becomeRecovered(Sim* sim);
        void becomeDead(Sim* sim);

    private:

        bool isVulnerable();
        // Exposed
        bool isSick();
        bool isContagious();
        bool isShowingSymptoms();
        bool isRecovered();
        // Get exposed... won't be contagious for a while still though...
        void becomeContagious();
        void becomeSymptomy();
        void endSymptoms();
        void endContagious();
        void becomeSevereOrCritical();
        void becomeIsolated(Sim* sim);
        bool inRange(bool condition, int start, int end) {
            return condition && time_since_infected >= start && time_since_infected < end;
        }

        // spreading
        float probabilityMultiplierFromDensity(float density);
        int howManyCatchItInThisTimeStep(RNG& rand, float prob, size_t popSize, size_t maxPeopleYouCanSpreadItToInYourRadius);
        void spreadInAPlace(long long int time_steps_since_start, const std::string& activityType, int placeIndex, float density, std::vector<PersonCore>& pop, RNG& rand, Sim& sim);

    };


    template<bool fillLists>
    void OccupantCounter::doCount(int hour) {
        if(verbose > 0) printf("OccupantCounter::doCount personPlaceInfo.size=%zu\n", personPlaceInfo.size());

        for (size_t index = 0; index < sim->placesByType.size(); index++) {
            Sim::PlaceSet& ps = sim->placesByType[index];
            std::fill(ps.occupantCount.begin(), ps.occupantCount.end(), 0);
            if (fillLists) {
                for (size_t iPlace = 0; iPlace < ps.occupantCount.size(); iPlace++) {
                    ps.occupantList[iPlace].clear();
                }
            }
        }

        for (size_t i = 0; i < personPlaceInfo.size(); i++) {
            const PersonPlaceOnly& p = personPlaceInfo[i];
            const char personActivity = p.getActivity(hour);

            for (size_t index = 0; index < sim->placesByType.size(); index++) {
                Sim::PlaceSet& ps = sim->placesByType[index];
                if (personActivity == ps.activityType) {
                    int personPlaceIndex = p.placeIndex[index];
                    if (fillLists) {
                        ps.occupantList[personPlaceIndex].push_back((unsigned int)i);
                    }
                    ps.occupantCount[personPlaceIndex]++;
                }
            }
        }
    }

    Sim::Sim(int nPersons) : occupantCounter(new OccupantCounter(this, nPersons)) {
        persons.reserve(nPersons); // helps perf a bit: single allocation
    }

    Sim::~Sim() {
        delete occupantCounter;
    }

    PersonPlaceOnly::PersonPlaceOnly(const PersonCore& p) {
        isolating = p.isolating;
        activityIndex = p.activityIndex;
        for (int i = 0; i < PERSON_MAX_PLACE_TYPES; i++) {
            placeIndex[i] = p.placeIndex[i];
        }
    }

    void Sim::runPopulationStep(unsigned int time_steps_since_start) {
        lastStepInfected.clear();
        lastStepRecovered.clear();
        lastStepDead.clear();

        for (size_t i = 0; i < persons.size(); i++) {
            persons[i].stepTime(this, rng);
            persons[i].spread(time_steps_since_start, i, persons, rng, *this);
        }
    }

    OccupantCounter::OccupantCounter(Sim* sim, int nPersons) : sim(sim) {
        personPlaceInfo.reserve(nPersons);
    }

    // stepTime

    bool PersonCore::stepTime(Sim* sim, RNG& rand) {
        if (isSick()) {
            if (inRange(!contagious, contagiousTrigger, endContagiousTrigger)) becomeContagious();
            if (inRange(symptomsCurrent == SymptomsLevels::none, symptomsTrigger, endSymptomsTrigger)) becomeSymptomy();
            if (symptomsCurrent != SymptomsLevels::none && symptomaticOverall && time_since_infected >= endSymptomsTrigger)
                endSymptoms();
            if (contagious && time_since_infected >= endContagiousTrigger) {
                // Maybe a little redundant...
                endContagious();
                becomeRecovered(sim);
            }
            if (inRange(symptomsCurrent < SymptomsLevels::severe, severeTrigger, endSymptomsTrigger))
                // if (symptomsCurrent < SymptomsLevels::severe && time_since_infected >= severeTrigger)
                becomeSevereOrCritical();
            if (contagious && time_since_infected >= deadTrigger) {
                becomeDead(sim);
                if (sim) sim->totalDead++;
            }
            if (symptomsCurrent != SymptomsLevels::none && time_since_infected >= isolationTrigger) becomeIsolated(sim);

            time_since_infected = time_since_infected + 1;
            return true;
        }
        return false;
    }

    // Susceptible
    bool PersonCore::isVulnerable() {
        return !infected && !recovered && !dead;
    }
    // Exposed
    bool PersonCore::isSick() {
        return infected && !recovered && !dead;
    }
    bool PersonCore::isContagious() {
        return contagious && !recovered && !dead;
    }
    bool PersonCore::isShowingSymptoms() {
        return symptomsCurrent != SymptomsLevels::none && symptomaticOverall && !recovered && !dead;
    }
    bool PersonCore::isRecovered() {
        return recovered && !dead;
    }

    // Get exposed... won't be contagious for a while still though...
    void PersonCore::becomeSick(Sim* sim) {
        if (verbose > 0) {
            printf("becomeSick: %u\n", id);
        }
        time_since_infected = 0.0;
        infected = true;
        if (sim) {
            //let info : [number, number, number] = [xpos, ypos, sim.time_steps_since_start];
            //sim.infectedVisuals.push(info);
            sim->totalInfected++;
            sim->lastStepInfected.push_back(id);
        }
    }

    void Sim::becomeSick(int index) {
        persons[index].becomeSick(this);
    }

    void PersonCore::becomeContagious() {
        if (symptomsCurrent != SymptomsLevels::none) {
            printf("becomeSymptomy %d %d - %d %d\n", contagiousTrigger, endContagiousTrigger, endContagiousTrigger, endSymptomsTrigger);
        }

        util_assert(infected, "ERROR: contagious without being infected." + std::to_string(id));
        util_assert(symptomsCurrent == SymptomsLevels::none, "ERROR: contagious after having symptoms - maybe not worst thing?" + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        contagious = true;
    }

    void PersonCore::becomeSymptomy() {
        util_assert(infected, "ERROR: symptoms without being infected." + std::to_string(id));
        util_assert(contagious, "ERROR: symptoms before having contagious - maybe not worst thing?" + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        symptomsCurrent = SymptomsLevels::mild;
    }

    void PersonCore::endSymptoms() {
        util_assert(infected, "ERROR: end symptoms without being infected." + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        symptomsCurrent = SymptomsLevels::none;
    }

    void PersonCore::endContagious() {
        util_assert(infected, "ERROR: recovered without being infected." + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        contagious = false;
    }

    void PersonCore::becomeRecovered(Sim* sim) {
        util_assert(infected, "ERROR: recovered without being infected." + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        recovered = true;
        infected = false;
        symptomsCurrent = SymptomsLevels::none;
        contagious = false;
        isolating = false;
        sim->occupantCounter->personPlaceInfo[id].isolating = false;
        sim->lastStepRecovered.push_back(id);
    }

    void PersonCore::becomeSevereOrCritical() {
        if (symptomsCurrent == SymptomsLevels::none) {
            printf("becomeSevereOrCritical severe %d - symptomsTrigger %d %d\n", severeTrigger, symptomsTrigger, endSymptomsTrigger);
        }
        util_assert(infected, "ERROR: severe without being infected." + std::to_string(id));
        util_assert(symptomsCurrent != SymptomsLevels::none, "ERROR: must have symptoms to be severe." + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));

        if (criticalIfSevere) symptomsCurrent = SymptomsLevels::critical;
        else symptomsCurrent = SymptomsLevels::severe;
    }

    void PersonCore::becomeDead(Sim* sim) {
        util_assert(infected, "ERROR: dead without being infected." + std::to_string(id));
        util_assert(contagious, "ERROR: dying without being contagious" + std::to_string(id));
        util_assert(!dead, "ERROR: already dead!" + std::to_string(id));
        util_assert(!recovered, "ERROR: already recovered!" + std::to_string(id));
        dead = true;
        infected = false;
        contagious = false;
        sim->lastStepDead.push_back(id);

    }

    void PersonCore::becomeIsolated(Sim* sim) {
        isolating = true;
        sim->occupantCounter->personPlaceInfo[id].isolating = true;
    }

    // sets the number of places, per type (homes, hospitals, etc)
    void Sim::setNumberOfPlacesForActivity(const std::string& activityType_s, int count, float density) {
        char activityType = activityType_s[0];
        if (activityToPlaceSetIndex.count(activityType)) {
            throw std::runtime_error("setNumberOfPlacesForActivity can only be called once per place type at initialization");
        }
        if (placesByType.size() >= PERSON_MAX_PLACE_TYPES) {
            throw std::runtime_error("maximum number of place types reached. plase change the macro PERSON_MAX_PLACE_TYPE." + std::to_string(placesByType.size()));
        }
            
        activityToPlaceSetIndex[activityType] = placesByType.size();
        activityDensity[activityType] = density;

        PlaceSet ps;
        ps.activityType = activityType;
        ps.occupantCount.resize(count);
        placesByType.emplace_back(std::move(ps));
    }

    void Sim::registerNormalActivitySchedule(const std::string& activityScheduleString) {
        activitiesNormal.push_back(activityScheduleString);
    }

    void Sim::registerSickActivitySchedule(const std::string& activityScheduleString) {
        activitiesWhileSick.push_back(activityScheduleString);
    }

    void Sim::addPerson(const PersonCore& p) {
        persons.push_back(p);
    }

    void Sim::prepare() {

        occupantCounter->prepare();
    }
    
    void OccupantCounter::prepare() {

        personPlaceInfo.clear();
        personPlaceInfo.reserve(sim->personsCount());
        for (size_t i = 0; i < sim->personsCount(); i++) {
            personPlaceInfo.push_back(PersonPlaceOnly(*sim->getPerson(i)));
        }

        example_javascript_c_api((int)personPlaceInfo.size());

        for (size_t index = 0; index < sim->placesByType.size(); index++) {
            Sim::PlaceSet& ps = sim->placesByType[index];

            size_t nPlaces = ps.occupantCount.size();
            ps.occupantList.resize(nPlaces);
            ps.residentsList.resize(nPlaces);

            for (size_t iPlace = 0; iPlace < nPlaces; iPlace++) {
                ps.residentsList[iPlace].clear();
                ps.occupantList[iPlace].clear();
            }

            for (size_t i = 0; i < personPlaceInfo.size(); i++) {
                const PersonPlaceOnly& p = personPlaceInfo[i];
                int personPlaceIndex = p.placeIndex[index];
                ps.residentsList[personPlaceIndex].push_back(i);
            }

            for (size_t iPlace = 0; iPlace < nPlaces; iPlace++) {
                // this avoids later allocations, at the cost of memory
                ps.occupantList[iPlace].reserve(ps.residentsList[iPlace].size());
            }
        }

    }

    // call whenever person changes isolating mode, and hence activity schedule
    void Sim::updatePersonIsolating(int personId, bool sickMode) {
        persons[personId].isolating = sickMode;
    }


    // counts and fills lists
    void OccupantCounter::countAndFillLists(int hour) {
        doCount<true>(hour);
    }

    // only counts occupants
    void OccupantCounter::countOnly(int hour) {
        doCount<false>(hour);
    }

    // passing the C++ objects like std::vector is risky: need to delete them or they leak
    int OccupantCounter::getOccupantCount(const std::string& activityType, int index) const {
        return sim->placesByType[sim->activityToPlaceSetIndex.at(activityType[0])].occupantCount[index];
    }

    // returns the occupant lists. quite expensive.
    std::vector<unsigned int> OccupantCounter::getOccupants(const std::string& activityType, int index) {
        return sim->placesByType[sim->activityToPlaceSetIndex.at(activityType[0])].occupantList[index];
    }

    // this minimizes copies
    std::vector<unsigned int> OccupantCounter::getNRandomOccupants(RNG::seed_int_t seed, const std::string& activityType, int index, int count) {
        std::vector<unsigned int> ret;
        const auto& wholeList = sim->placesByType[sim->activityToPlaceSetIndex.at(activityType[0])].occupantList[index];
        for (int i = 0; i < count; i++) {
            //int j = sim->rng.random_int(0, wholeList.size());
            int j = sim->rng.rand_int_approx(0, wholeList.size());

            ret.push_back(wholeList[j]);
        }
        return ret;
    }


    // spreading

    // For now, density can be thought of as your distance to the closest person.
    // Clamped at 0.5 minimum
    // This returns a [0..1] probability multiplier for probability of spreading the virus.
    float PersonCore::probabilityMultiplierFromDensity(float density) {
        if (density < 0.5f) density = 0.5f;
        return 0.5f / powf(density, 1.5f);
    }

    // This should be a function of density and how much you mix with people.
    // How much you mix can be measured as a fraction of all the people in the space that you will come in range of???
    // Density will affect the outcome based on distance to other people???
    // TODO: optimize me using "real math". :)
    // TODO: maxPeopleYouCanSpreadItToInYourRadius is totally arbitrary
    int PersonCore::howManyCatchItInThisTimeStep(RNG& rand, float prob, size_t popSize, size_t maxPeopleYouCanSpreadItToInYourRadius) {
        popSize = std::min(popSize, maxPeopleYouCanSpreadItToInYourRadius);
        int total = 0;
        for (size_t i = 0; i < popSize; i++) {
            if (rand.random() < prob /*- 1.0*/) total++;
            // if (rtemp.RandFloat() < prob /*- 1.0*/) total++;
        }
        return total;
    }

    void PersonCore::spreadInAPlace(long long int time_steps_since_start_raw, const std::string& activityType, int placeIndex, float density, std::vector<PersonCore>& pop, RNG& rand, Sim& sim) {
        float prob = sim.params.prob_baseline_timestep * probabilityMultiplierFromDensity(density);
        int nOccupants = sim.occupantCounter->getOccupantCount(activityType, placeIndex);
        int numSpread = howManyCatchItInThisTimeStep(rand, prob, nOccupants, 30);

        RNG::seed_int_t seed = time_steps_since_start_raw * 4096 + id; // Unique for time step and each person
        std::vector<unsigned int> spreatToList = sim.occupantCounter->getNRandomOccupants(seed, activityType, placeIndex, numSpread); // selects n random occupants
        
        if (numSpread > 0 && verbose > 0) {
            printf("id=%u spread numSpread=%d nOccupants=%d prob=%e\n", id, numSpread, nOccupants, prob);
        }

        for (int i = 0; i < numSpread; i++) {
            unsigned int targetIndex = spreatToList[i];
            if (pop[targetIndex].isVulnerable()) pop[targetIndex].becomeSick(&sim);
        }
    }

    void PersonCore::spread(long long int time_steps_since_start, int index, std::vector<PersonCore>& pop, RNG& rand, Sim& sim) {
        
        if (isContagious()) {
            //printf("id=%u spread isContagious=%d sick=%d infected=%d\n", id, isContagious(), isSick(), infected);
            TimeStep ts(time_steps_since_start);
            int currentStep = ts.getStepModDay();
            char activity = getActivity(currentStep);
            //TODO: needed?
            //int64_t seed = time_steps_since_start;
            //seed = seed*4096 + index; // Unique for time step and each person

            if (activity == (char)ActivityType::home || activity == (char)ActivityType::work || activity == (char)ActivityType::shopping) {
                int index = placeIndex[sim.activityToPlaceSetIndex[activity]];

                spreadInAPlace(
                    time_steps_since_start,
                    std::string(1, activity), index,
                    sim.activityDensity[activity],
                    pop,
                    rand,
                    sim
                );
            }
        }
    }


};

#if HAS_EMSCRIPTEN
EMSCRIPTEN_BINDINGS(OccupantCounterModule) {
    emscripten::register_vector<int>("int_vector");
    emscripten::register_vector<unsigned int>("uint_vector");

    emscripten::class_<EpidemicSimCore::PersonCore>("PersonCore")
        .constructor<unsigned int, std::vector<int>, int>()
        .property("id", &EpidemicSimCore::PersonCore::id)
        .property("infected", &EpidemicSimCore::PersonCore::infected)
        .property("time_since_infected", &EpidemicSimCore::PersonCore::time_since_infected)
        .property("recovered", &EpidemicSimCore::PersonCore::recovered)
        .property("dead", &EpidemicSimCore::PersonCore::dead)
        .property("contagious", &EpidemicSimCore::PersonCore::contagious)
        .property("symptomaticOverall", &EpidemicSimCore::PersonCore::symptomaticOverall)
        .property("isolating", &EpidemicSimCore::PersonCore::isolating)
        .property("criticalIfSevere", &EpidemicSimCore::PersonCore::criticalIfSevere)
        .property("contagiousTrigger", &EpidemicSimCore::PersonCore::contagiousTrigger)
        .property("endContagiousTrigger", &EpidemicSimCore::PersonCore::endContagiousTrigger)
        .property("symptomsTrigger", &EpidemicSimCore::PersonCore::symptomsTrigger)
        .property("endSymptomsTrigger", &EpidemicSimCore::PersonCore::endSymptomsTrigger)
        .property("deadTrigger", &EpidemicSimCore::PersonCore::deadTrigger)
        .property("severeTrigger", &EpidemicSimCore::PersonCore::severeTrigger)
        .property("isolationTrigger", &EpidemicSimCore::PersonCore::isolationTrigger)
        .property("symptomsCurrent", &EpidemicSimCore::PersonCore::symptomsCurrent)
        .function("getActivity", &EpidemicSimCore::PersonCore::getActivity)
        ;

    emscripten::class_<EpidemicSimCore::OccupantCounter>("OccupantCounter")
        .function("countOnly", &EpidemicSimCore::OccupantCounter::countOnly)
        .function("countAndFillLists", &EpidemicSimCore::OccupantCounter::countAndFillLists)
        .function("prepare", &EpidemicSimCore::OccupantCounter::prepare)
        .function("getOccupantCount", &EpidemicSimCore::OccupantCounter::getOccupantCount)
        .function("getOccupants", &EpidemicSimCore::OccupantCounter::getOccupants)
        .function("getNRandomOccupants", &EpidemicSimCore::OccupantCounter::getNRandomOccupants)
        ;

    emscripten::class_<EpidemicSimCore::Sim>("Sim")
        .constructor<int>()
        .function("getOccupantCounter", &EpidemicSimCore::Sim::getOccupantCounter, emscripten::allow_raw_pointers())
        .class_function("registerNormalActivitySchedule", &EpidemicSimCore::Sim::registerNormalActivitySchedule)
        .class_function("registerSickActivitySchedule", &EpidemicSimCore::Sim::registerSickActivitySchedule)
        .function("updatePersonIsolating", &EpidemicSimCore::Sim::updatePersonIsolating)
        .function("setNumberOfPlacesForActivity", &EpidemicSimCore::Sim::setNumberOfPlacesForActivity)
        .function("prepare", &EpidemicSimCore::Sim::prepare)
        .function("becomeSick", &EpidemicSimCore::Sim::becomeSick)
        .function("addPerson", &EpidemicSimCore::Sim::addPerson)
        .function("runPopulationStep", &EpidemicSimCore::Sim::runPopulationStep)
        .function("getPerson", &EpidemicSimCore::Sim::getPerson, emscripten::allow_raw_pointers())
        .property("totalInfected", &EpidemicSimCore::Sim::totalInfected)
        .property("totalDead", &EpidemicSimCore::Sim::totalDead)
        .property("lastStepRecovered", &EpidemicSimCore::Sim::lastStepRecovered)
        .property("lastStepInfected", &EpidemicSimCore::Sim::lastStepInfected)
        .property("lastStepDead", &EpidemicSimCore::Sim::lastStepDead)
        ;

    emscripten::class_<EpidemicSimCore::RandomFast>("RandomFast")
        .constructor<double>()
        .function("RandFloat", &EpidemicSimCore::RandomFast::RandFloat)
        .class_function("SmallHashA", &EpidemicSimCore::RandomFast::SmallHashA)
        .class_function("SmallHashB", &EpidemicSimCore::RandomFast::SmallHashB)
        .class_function("HashIntApprox", &EpidemicSimCore::RandomFast::HashIntApprox)
        ;

}
#else

void example_javascript_c_api(int z) {
}

#endif
