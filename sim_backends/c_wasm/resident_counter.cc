
#include <vector>
#include <list>
#include <map>
#include <cstdlib>
#include <emscripten/bind.h>

// constructor in global namespace. 
// TODO: a huge vector of char[24] skips a pointer indirection.
std::vector<std::string> activitiesNormal;
std::vector<std::string> activitiesWhileSick;

namespace EpidemicSimCore {

    #define PERSON_MAX_PLACE_TYPES 5
    // This could be embedded inside the javascript person object, to avoid duplication of code and data. 
    // Just essential topology data, like this person's places indices.
    struct PersonCore {
        unsigned int id = 0; // TODO: uint enough?
        int placeIndex[PERSON_MAX_PLACE_TYPES];
        int activityIndex = 0;
        bool isolating = false;

        PersonCore(unsigned int id, const std::vector<int>& placeIndexes, int activityIndex)
            : id(id), activityIndex(activityIndex) {
            memset(placeIndex, 0, sizeof(placeIndex));
            for (size_t i = 0; i < placeIndexes.size(); i++) {
                placeIndex[i] = placeIndexes[i];
            }
        }

        char getActivity(int hour) const {
            if(isolating) {
                return activitiesWhileSick[0][hour];
            } else {
                return activitiesNormal[activityIndex][hour];
            }
        }
    };

    struct OccupantCounter {
        std::vector<PersonCore> persons;

        // all hospitals, etc
        struct PlaceSet {
            char activityType = 'h';
            std::vector<int> occupantCount;
            std::vector<std::vector<unsigned int>> occupantList;
            std::vector<std::vector<unsigned int>> residentsList;
        };

        std::vector<PlaceSet> placesByType;
        std::map<char, int> activityToPlaceSetIndex;
        unsigned int rand_r_seed = 1993;

        OccupantCounter(int nPersons) {
            persons.reserve(nPersons); // helps perf a bit: single allocation
        }

        // sets the number of places, per type (homes, hospitals, etc)
        void setNumberOfPlacesForActivity(const std::string& activityType_s, int count) {
            char activityType = activityType_s[0];
            if (activityToPlaceSetIndex.count(activityType)) {
                throw std::runtime_error("setNumberOfPlacesForActivity can only be called once per place type at initialization");
            }            
            if (placesByType.size() >= PERSON_MAX_PLACE_TYPES) {
                throw std::runtime_error("maximum number of place types reached. plase change the macro PERSON_MAX_PLACE_TYPE." + std::to_string(placesByType.size()));
            }
            
            activityToPlaceSetIndex[activityType] = placesByType.size();

            PlaceSet ps;
            ps.activityType = activityType;
            ps.occupantCount.resize(count);
            placesByType.emplace_back(std::move(ps));
        }

        static void registerNormalActivitySchedule(const std::string& activityScheduleString) {
            activitiesNormal.push_back(activityScheduleString);
        }

        static void registerSickActivitySchedule(const std::string& activityScheduleString) {
            activitiesWhileSick.push_back(activityScheduleString);
        }

        void addPerson(const PersonCore& p) {
            persons.push_back(p);
        }

        void prepare() {
            for (size_t index = 0; index < placesByType.size(); index++) {
                PlaceSet& ps = placesByType[index];

                size_t nPlaces = ps.occupantCount.size();
                ps.occupantList.resize(nPlaces);
                ps.residentsList.resize(nPlaces);

                for (size_t iPlace = 0; iPlace < nPlaces; iPlace++) {
                    ps.residentsList[iPlace].clear();
                    ps.occupantList[iPlace].clear();
                }

                for (size_t i = 0; i < persons.size(); i++) {
                    const PersonCore& p = persons[i];
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
        void updatePersonIsolating(int personId, bool sickMode) {
            persons[personId].isolating = sickMode;
        }

        // counts and optionally fills lists
        template<bool fillLists>
        void doCount(int hour) {
            printf("OccupantCounter::doCount persons.size=%zu\n", persons.size());

            for (size_t index = 0; index < placesByType.size(); index++) {
                PlaceSet& ps = placesByType[index];
                std::fill(ps.occupantCount.begin(), ps.occupantCount.end(), 0);
                if (fillLists) {
                    for (size_t iPlace = 0; iPlace < ps.occupantCount.size(); iPlace++) {
                        ps.occupantList[iPlace].clear();
                    }
                }
            }

            for (size_t i = 0; i < persons.size(); i++) {
                const PersonCore& p = persons[i];
                const char personActivity = p.getActivity(hour);

                for (size_t index = 0; index < placesByType.size(); index++) {
                    PlaceSet& ps = placesByType[index];
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


        // counts and fills lists
        void countAndFillLists(int hour) {
            doCount<true>(hour);
        }

        // only counts occupants
        void countOnly(int hour) {
            doCount<false>(hour);
        }

        // passing the C++ objects like std::vector is risky: need to delete them or they leak
        int getOccupantCount(const std::string& activityType, int index) const {
            return placesByType[activityToPlaceSetIndex.at(activityType[0])].occupantCount[index];
        }

        // returns the occupant lists. quite expensive.
        std::vector<unsigned int> getOccupants(const std::string& activityType, int index) {
            return placesByType[activityToPlaceSetIndex.at(activityType[0])].occupantList[index];
        }

        // this minimizes copies
        std::vector<unsigned int> getNRandomOccupants(const std::string& activityType, int index, int count) {
            std::vector<unsigned int> ret;
            const auto& wholeList = placesByType[activityToPlaceSetIndex.at(activityType[0])].occupantList[index];
            for (int i = 0; i < count; i++) {
                // TODO this is deterministic but better use the official RNG
                ret.push_back(wholeList[rand_r(&rand_r_seed)%wholeList.size()]);
            }
            return ret;
        }

    };

};

EMSCRIPTEN_BINDINGS(OccupantCounterModule) {
    emscripten::register_vector<int>("int_vector");
    emscripten::register_vector<unsigned int>("uint_vector");
    emscripten::class_<EpidemicSimCore::PersonCore>("PersonCore")
        .constructor<unsigned int, std::vector<int>, int>()
        .property("id", &EpidemicSimCore::PersonCore::id)
        .function("getActivity", &EpidemicSimCore::PersonCore::getActivity)
        ;
    emscripten::class_<EpidemicSimCore::OccupantCounter>("OccupantCounter")
        .constructor<int>()
        .function("countOnly", &EpidemicSimCore::OccupantCounter::countOnly)
        .function("countAndFillLists", &EpidemicSimCore::OccupantCounter::countAndFillLists)
        .function("addPerson", &EpidemicSimCore::OccupantCounter::addPerson)
        .function("prepare", &EpidemicSimCore::OccupantCounter::prepare)
        .function("updatePersonIsolating", &EpidemicSimCore::OccupantCounter::updatePersonIsolating)
        .class_function("registerNormalActivitySchedule", &EpidemicSimCore::OccupantCounter::registerNormalActivitySchedule)
        .class_function("registerSickActivitySchedule", &EpidemicSimCore::OccupantCounter::registerSickActivitySchedule)
        .function("setNumberOfPlacesForActivity", &EpidemicSimCore::OccupantCounter::setNumberOfPlacesForActivity)
        .function("getOccupantCount", &EpidemicSimCore::OccupantCounter::getOccupantCount)
        .function("getOccupants", &EpidemicSimCore::OccupantCounter::getOccupants)
        .function("getNRandomOccupants", &EpidemicSimCore::OccupantCounter::getNRandomOccupants)
        ;
}
