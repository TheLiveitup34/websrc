import Controller from '../libraries/Controller.js';

export default class Widget extends Controller {
    #websrcs = ["watch", "nowplaying"];

    _constructor() {
        this.defaults.externalLinks = false;
        this.defaults.header = false;
        this.defaults.footer = false;
        
        this.defaults.app.css = [];
        this.defaults.app.js = [
            "/assets/js/websrc.js"
        ];

        this.parameters = new URLSearchParams(window.location.search);
        this.userAgent = navigator.userAgent.toLowerCase();
        this.embeded = window.self !== window.top;
    }

    async index(widget = null) {
        console.log("Widget index called with widget:", widget);
        if (widget === null) {
            this.notFound();
            return;
        }
        const websrc = this.#websrcs.includes(widget) ? widget : 'watch';
        if (this.parameters.has('streaming') || this.userAgent.includes('obs') || this.userAgent.includes('streamlabs') || this.userAgent.includes('meld') || this.embeded === true || this.parameters.has('streaming')) {
            this.defaults.app.css.push(`/assets/css/${websrc}.css`);
            this.defaults.app.js.push(`/assets/js/${websrc}.js`);
            await this.view(websrc);
        } else {
            await this.modify();
            return;
        }
    }

    
}