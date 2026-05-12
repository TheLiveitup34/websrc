import Controller from '../libraries/Controller.js';

export default class Index extends Controller {
    #websrcs = ["watch", "flashboang"];

    _constructor() {
        this.defaults.externalLinks = false;
        this.defaults.header = false;
        this.defaults.footer = false;
        
        this.defaults.app.css = [
            "./assets/css/watch.css"
        ];
        this.defaults.app.js = [
            "./assets/js/websrc.js",
            "./assets/js/watch.js"
        ];

        this.parameters = new URLSearchParams(window.location.search);
        this.userAgent = navigator.userAgent.toLowerCase();
        this.embeded = window.self !== window.top;
    }

    async index() {
        
        if (this.parameters.has('streaming') || this.userAgent.includes('obs') || this.userAgent.includes('streamlabs') || this.embeded === true || this.parameters.has('streaming')) {
            await this.view('watch');
        } else {
            await this.modify();
            return;
        }


    }

    
}