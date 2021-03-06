import Vue from "vue";
import Vuex from "vuex";
import apiCalls from '@/apiCalls.js';
import moment from 'moment';
import createPersistedState from "vuex-persistedstate";
import CryptoJS from 'crypto-js';
import SecureStorage from 'secure-web-storage';

Vue.use(Vuex);

//EVENTS MODULE
const getEventDefaultState = () => {
    return {
        events: [],
        links: {},
        touched: true
    }
}

const events = {
    namespaced: true,
    state: getEventDefaultState(),
    getters: {
        //  GET EVENT BY ID
        id: (state) => (eventId) => {
            return state.events.find(event => event.event_id === eventId)
        },
        // GETTERS TO FILTER EVENTS INTO CURRENT, DELETED, ADDED, AND UPDATED EVENTS
        current: (state) => {
            state.touched
            return state.events.filter(event => !event.delete)
        },
        deleted: (state) => {
            state.touched
            return state.events.filter(event => event.delete)
        },
        added: (state) => {
            state.touched
            return state.events.filter(event => (event.add && !event.delete))
        },
        updated: (state) => {
            state.touched
            return state.events.filter(event => (event.update && !event.delete && !event.add))
        },
    },
    mutations: {
        setEvent(state, event) {
            state.events.push(event)
        },
        setLinks(state, links) {
            state.links = links
        },
        // need to check if the event was just added // if it was, then just remove it directly
        deleteEvent(state, eventId) {
            let event = state.events.find(event => event.event_id === eventId)
            if(event != undefined) { 
                event.delete = true 
                state.touched = !state.touched
            }
        },
        // if it was added, then we don't set update to true
        updateEvent(state, value) {
            let eventId = state.events.findIndex(event => event.event_id === value.event_id)
            if(eventId >= 0) {
                state.events[eventId] = value
                if(!state.events[eventId].add) {
                    state.events[eventId].update = true
                }
                state.touched = !state.touched
            }
        },
        removeEvent(state, eventId) {
            let id = state.events.findIndex(event => event.event_id === eventId)
            if(id >= 0) {
                state.events.splice(id, 1)
            }
        },
        addedEvent(state, ids) {
            let index = state.events.findIndex(event => event.event_id === ids.old)
            if(index >= 0) {
                state.events[index].event_id = ids.new
                state.events[index].add = false
                state.events[index].update = false
            }
        },
        resetState(state) {
            Object.assign(state, getEventDefaultState())
        }
    },
    actions: {
        addBlankEvent({commit, state, rootState}) {
            let newID = state.events[state.events.length - 1].event_id + 1
            let newEvent = {
                event_id: newID,
                patient_id: rootState.activePatientId,
                confirmed: false,
                contact_ids: [],
                start_time: null,
                end_time: null,
                location: {
                    coordinates: {},
                    streetName: ''
                },
                add: true,
                delete: false,
                update: false,
                dateValid: false
            }
            commit('setEvent', newEvent)
        },
        //LOADS IN EVENTS
        async load({commit, rootState}, patientId) {
            // get the link from the patients namespace
            let link = `${rootState.patients.links.get_events}${patientId}`
            let response = await apiCalls.getEvents(link)
            for(let event of response.events) {
                commit('setEvent', event)
            }
            commit('setLinks', response.links)
        },

        //SUBMIT -- takes valid input
        async submit({commit, getters, state, rootState}) {
            let massageLocation = function(event) {
                if(event.location.coordinates) {
                    event.geom = {
                        coordinates: [event.location.coordinates.lng, event.location.coordinates.lat],
                        type: "Point"
                    }
                }
                return event
            }
            //DELETES THE DELETED EVENTS
            let toDelete = getters['deleted']
            let dLink = state.links.delete
            let deleteSuccess = await apiCalls.deleteEvents(dLink, toDelete)
            for(let s of deleteSuccess) {
                commit('removeEvent', s)
            }
            //ADDS THE ADDED EVENTS
            let toAdd = getters['added']
            let aLink = rootState.patients.links.insert_event
            for (let index in toAdd) {
                toAdd[index] = massageLocation(toAdd[index])
            }
            let addSuccess = await apiCalls.addEvents(aLink, toAdd)
            for(let oldId of Object.keys(addSuccess)) {
                commit('addedEvent', { old: oldId, new: addSuccess[oldId]})
            }

            //UPDATES THE UPDATED EVENTS
            let toUpdate = getters['updated']
            let uLink = state.links.update
            for (let index in toUpdate) {
                toUpdate[index] = massageLocation(toUpdate[index])
            }
            let updateSuccess = await apiCalls.updateEvents(uLink, toUpdate)
            for(let s of updateSuccess) {
                let id = state.events.findIndex(event => event.event_id === s)
                state.events[id].update = false
            }
            if((toDelete.length - deleteSuccess.length)
                + (toUpdate.length - updateSuccess.length)
                + (toAdd.length - addSuccess.length)
                > 0) 
            {
                return false
            } else {
                return true
            }
        },
        resetState({commit}) { commit('resetState') }
    }
}

//PATIENTS MODULE
const getPatientDefaultState = () => {
    return {
        patients: [],
        links: {},
        touched: true,
        activePatient: null
    }
}

const patients = {
    namespaced: true,
    state: getPatientDefaultState(),
    getters: {
        activePatient: (state, getters, rootState) =>  {
            return state.patients.find(patient => patient.patient_id === rootState.activePatientId)
        },
        id: (state) => (patientId) => {
            return state.patients.find(patient => patient.patient_id === patientId)
        },
        criticalDate(state, getters, rootState) {
            state.touched
            let patient = state.patients.find(patient => patient.patient_id === rootState.activePatientId)
            console.log(patient.symptomatic)
            if(patient && patient.symptomatic) {
                return patient.onset_date
            } else {
                return patient.diagnosis_date
            }
        },
        readableStartDate: (state, getters) => {
            let startDate = getters.criticalDate.clone()
            return startDate.subtract(2, 'days').format('MMMM Do, YYYY')
        },
        startDate: (state, getters) => {
            let startDate = getters.criticalDate.clone()
            return startDate.subtract(2, 'days').format('YYYY-MM-DD')
        },
        readableEndDate: (state, getters) => {
            let endDate = getters.criticalDate.clone()
            let today = moment()
            endDate.add(10,'days')
            return (endDate.isAfter(today) ? today.format('MMMM Do, YYYY') : endDate.format('MMMM Do, YYYY'))
        },
        endDate: (state, getters) => {
            let endDate = getters.criticalDate.clone()
            let today = moment()
            endDate.add(10,'days')
            return (endDate.isAfter(today) ? today.format('YYYY-MM-DD') : endDate.format('YYYY-MM-DD'))
        },
        getAllPatients: (state) => {
            return state.patients
        }
    },
    mutations: {
        setPatients(state, value) {
            state.patients.push(value)
        },
        setActivePatient(state, activeId) {
            let patient = state.patients.find(patient => patient.patient_id === activeId)
            if(patient != null) {
                state.activePatient = patient
            }
        },
        setLinks(state, links) {
            Object.keys(links).forEach(index => {
                // console.log(link)
                state.links[links[index]['rel']] = links[index]['href'].replace(/\d+$/, "")
            })
        }, 
        updatePatient(state, data) {
            let pid = state.patients.findIndex(patient => patient.patient_id === data.activePatientId)
            if (pid >= 0) {
                state.patients[pid] = data
            }
            state.touched = !state.touched
        },
        resetState(state) { Object.assign(state, getPatientDefaultState())}
    },
    actions: {
        initializePatient({commit}, response) {
            commit('setPatients', response.patient)
            commit('setLinks', response.links)
        },
        async update({state, commit}, patient) {
            let link = state.links.update
            let res = await apiCalls.updatePatient(link, patient)
            if (res) {
                commit('updatePatient', patient)
            }
            return res
        },
        resetState({commit}) { commit('resetState') },
        load({commit, dispatch}, patients) {
            if(patients.length == 0) {
                return
            }
            let links = patients[0].links
            delete patients[0].links
            let firstPatient = {
                patient: patients[0],
                links: links
            }
            dispatch('initializePatient', firstPatient)
            patients.splice(0, 1)
            for(let patient of patients) {
                commit('setPatients', patient)
            }
        }
    }
}

//CONTACTS MODULE
const getContactDefaultState =  () => {
    return {
        contacts:[],
        links: {},
        touched: true
    }
}

const contacts = {
    namespaced: true,
    state: getContactDefaultState(),
    getters: {
        newContactId(state) {
            if (state.contacts.length == 0) { return undefined }
            return state.contacts[state.contacts.length-1].contact_id
        },
        id: (state) => (id) => {
            state.touched
            return state.contacts.find(contact => contact.contact_id === id)
        },
        householdContacts: (state) => {
            console.log()
            return state.contacts.filter(contact => contact.household === true)
        },
        outsideContacts: (state) => {
            return state.contacts.filter(contact => contact.household === false)
        },
        contacts: (state) => { 
            state.touched 
            return state.contacts 
        },
        fullName: (state) => (id) => {
            state.touched
            let contact = state.contacts.find(contact => contact.contact_id === id)
            let firstName = contact.first_name == undefined ? '' : contact.first_name
            let lastName = contact.last_name == undefined ? '' : contact.last_name
            return firstName + ' ' + lastName
        }
    },
    mutations: {
        setContact(state, value) {
            if(value.contact_date) {
                value.contact_date = moment(value.contact_date)
            }
            state.contacts.push(value)
            state.touched = !state.touched
        },
        setLinks(state, value) {
            state.links = value
        },
        updateContact(state, value) {
            let contactId = state.contacts.findIndex(contact => contact.contact_id === value.contact_id)
            if(contactId >= 0) {
                state.contacts[contactId] = value
            }
            state.touched = !state.touched
        },
        resetState(state) { Object.assign(state, getContactDefaultState()) }
    },
    actions: {
        //loads in all contacts associated with a given patient
        async load({commit, rootState}, patientId) {
            let link = `${rootState.patients.links.get_contacts}${patientId}`
            console.log(rootState)
            let response = await apiCalls.getContacts(link)
            if(response.contacts) {
                for(let contact of response.contacts) {
                    delete contact.enums
                    delete contact.links
                    commit('setContact', contact)
                }
                commit('setLinks', response.links)
            }
        },
        //loads in all contacts associated with a given volunteer
        async loadVol({commit, rootState}) {
            let link=rootState.volunteers.links.get_contacts
            let response = await apiCalls.getContacts(link)
            if(response.contacts) {
                for(let contact of response.contacts) {
                    delete contact.enums
                    delete contact.links
                    commit('setContact', contact)
                }
                commit('setLinks', response.links)
            }
        },

        // COMMON METHODS
        async update({commit, state}, contact) {
            let link = state.links.update
            let response = await apiCalls.updateContact(link, contact) 
            if(response) {
                commit('updateContact', contact)
                return true
            } else {
                return false
            }
        },
        async add({commit, rootState}, contact) {
            let link = rootState.patients.links.insert_contact
            let pid = rootState.activePatientId
            contact.patient_id = pid
            let response = await apiCalls.addContact(link, contact)
            if(response != {}) {
                commit('setContact', response)
                return response.contact_id
            } else {
                return -1
            }
        },
        resetState({commit}) { commit('resetState') }
    }
}

//VOLUNTEERS MODULE
const getVolunteerDefaultState = () => {
    return {
        volunteers: [],
        links: {}, 
        touched: true,
        active: null
    }
}

const volunteers = {
    namespaced: true,
    state: getVolunteerDefaultState(),
    getters: {
        id: (state) => (id) => {
            state.touched
            return state.volunteers.find(volunteer => volunteer.contact_id === id)
        },
        active: (state) => {
            if(state.active != null) {
                console.log()
                return state.volunteers.find(volunteer => volunteer.volunteer_id === state.active)
            } else {
                return null
            }   
        }
    },
    mutations: {
        setVolunteer(state, value) {
            state.volunteers.push(value)
        },
        setLinks(state, value) {
            state.links = value
        },
        updateVolunteer(state, value) {
            let volId = state.volunteers.findIndex(volunteer => volunteer.volunteer_id === value.volunteer_id)
            if(volId >= 0) {
                state.volunteers[volId] = value
            }
            state.touched = !state.touched
        },
        setActive(state, value) {
            state.active = value
        },
        resetState(state) { Object.assign(state, getVolunteerDefaultState()) }
    },
    actions: {
        //loads in all information associated with a given volunteer
        async initializeVolunteer({commit, rootState}, data) {
            //sets the links associated with a volunteer
            commit('setVolunteer', data.volunteer)
            commit('setLinks', data.links)
            commit('setActive', data.volunteer.volunteer_id)
        },
        
        // we should def be calling this... but when ????  
        async update({commit, state}, volunteer) {
            let res = false
            let link = state.links.update
            await apiCalls.updateVolunteer(link, volunteer)
                .then(function(response) {
                    if(response != {}) {
                        commit('updateVolunteer', response)
                        res = true
                    }
                })
                .catch(function(error) { console.error(error) })
            return res
        },
        resetState({commit}) { commit('resetState') }
    }
}

// ROOT STORE
const getRootDefaultState = () => {
    return {
        loggedIn: false,
        showNavBar: false,
        activePatientId: undefined,
        activeVolunteerId: undefined,
        activeContactId: undefined,
        enums: {},
        userType: undefined,
        openPID: undefined,
        dialogClosed: true
    }
}

const SECRET_KEY = 'cats'

let secureStorage = new SecureStorage(sessionStorage, {
    hash: function hash(key) {
        key = CryptoJS.SHA256(key, SECRET_KEY);

        return key.toString();
    },
    encrypt: function encrypt(data) {
        data = CryptoJS.AES.encrypt(data, SECRET_KEY);

        data = data.toString();

        return data;
    },
    decrypt: function decrypt(data) {
        data = CryptoJS.AES.decrypt(data, SECRET_KEY);

        data = data.toString(CryptoJS.enc.Utf8);

        return data;
    }
});

export default new Vuex.Store({
    state: getRootDefaultState(),
    plugins: [createPersistedState({
        storage: secureStorage,
        setState: function(key, state, storage) {
            return storage.setItem(key, state)
        },
        getState: function(key, storage) {
            let value;
            try {
              (value = storage.getItem(key))
              if(value == undefined) {
                  return undefined
              } else {
                
                if (value.contacts.contacts) {
                    value.contacts.contacts = value.contacts.contacts.map((contact) => {
                        contact.contact_date = moment(contact.contact_date)
                        contact.update_date = moment(contact.update_date)
                        return contact
                    })
                }
                if (value.patients.patients) {
                    value.patients.patients = value.patients.patients.map((patient) => {
                        patient.diagnosis_date = moment(patient.diagnosis_date)
                        patient.onset_date = moment(patient.onset_date)
                        patient.last_worked_date = moment(patient.last_worked_date)
                        patient.date_of_birth = moment(patient.date_of_birth)
                        return patient
                    })
                }
                if (value.events.events) {
                    value.events.events = value.events.events.map((event) => {
                        event.start_time = moment(event.start_time)
                        return event
                    })
                }
                console.log(value)
                return value
              }
            } catch (err) {
                console.log(err)
            }
            
            return undefined;
          }
    })],
    getters: {
        activePatientId: (state) => {return state.activePatientId}
    },
    mutations: {
        closeDialog(state) {
            state.dialogClosed = !state.dialogClosed
        },
        logOut(state) {
            state.loggedIn = false
        },
        logIn(state) {
            state.loggedIn = true
        },
        setUserType(state, value) {
            state.userType = value
        },
        toggleNavBarToTrue(state) {
            state.showNavBar = true
        },
        setActivePatient(state, value) {
            state.activePatientId = value
        },
        setActiveVol(state, value) {
            state.activeVolunteerId = value
        },
        setEnums(state, enums) {
            state.enums = Object.assign({}, enums)
        },
        resetState(state) { Object.assign(state, getRootDefaultState()) },
        setOpenPID(state, value) {
            state.openPID = value
        }
    },
    actions: {
        async volunteerLogin({state, dispatch, commit}, data) {
            await dispatch('logOut')
            let response = await apiCalls.volunteerCheckLogin(data.credentials)
            if (response == null) { return false }
            commit('logIn')
            commit('setActiveVol', response.volunteer_id)
            let links = {}
            Object.keys(response._links).map((key) => {
                links[key] = response._links[key].href 
            })
            // load in the volunteer using volunteer
            let res = { volunteer: response, links: links }
            await dispatch('volunteers/initializeVolunteer', res)
            console.log(data.userType)
            if (data.userType == 'patient') {
                let link = response._links.get_patients.href
                // then get the patients
                let patients = await apiCalls.getPatientsForVol(link)
                // do this for the first patient but not the other ones
                await dispatch('patients/load', patients)
                if(state.patients.patients.length > 0) {
                    console.log(state)
                    let enums = await apiCalls.getEnums(state.patients.links.self + state.patients.patients[0].patient_id)
                    commit('setEnums', enums)
                }
                return true
            } else {
                await dispatch('contacts/loadVol')
                if(state.contacts.contacts.length > 0) {
                    let enums = await apiCalls.getEnums(state.contacts.links.self + state.contacts.contacts[0].contact_id)
                    commit('setEnums', enums)
                }
                return true
            }
        },
        async logOut({commit, dispatch}) {
            secureStorage.clear()
            dispatch('patients/resetState')
            dispatch('contacts/resetState')
            dispatch('events/resetState')
            dispatch('volunteers/resetState')
            commit('resetState')
            commit('logOut')
        },
        clearFormData({dispatch}) {
            dispatch('contacts/resetState')
            dispatch('events/resetState')
        },
        loadFormData({commit, dispatch}, pid) {
            commit('setActivePatient', pid)
            commit('patients/setActivePatient', pid)
            dispatch('contacts/load', pid)
            dispatch('events/load', pid)
        }
    },
    modules: {
        patients: patients,
        events: events,
        contacts: contacts,
        volunteers: volunteers
    }
});
