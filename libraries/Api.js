export default class Api {
    async get(data,options) {

        options  = (options == undefined) ? {} : options;

        const modifiers = {
            method: 'GET',
            ...options
        };

        const res = await fetch(`${this.loc}${data}`, modifiers);

        return res;

    }
    
    async post(data, options) {
        options  = (options == undefined) ? {} : options;

        const modifiers = {
            method: 'POST',
            ...options
        };

        const res = await fetch(`${this.loc}${data}`, modifiers);

        return res;
    }

    async put(data, options) {

        options  = (options == undefined) ? {} : options;

        const modifiers = {
            method: 'PUT',
            ...options
        };

        const res = await fetch(`${this.loc}${data}`, modifiers);

        return res;
    }

    async patch(data, options) {

        options  = (options == undefined) ? {} : options;

        const modifiers = {
            method: 'PATCH',
            ...options
        };

        const res = await fetch(`${this.loc}${data}`, modifiers);

        return res;
    }

    
    async delete(data, options) {

        options  = (options == undefined) ? {} : options;

        const modifiers = {
            method: 'DELETE',
            ...options
        };

        const res = await fetch(`${this.loc}${data}`, modifiers);

        return res;
    }

}