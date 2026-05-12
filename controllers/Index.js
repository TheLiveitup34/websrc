import Controller from '../libraries/Controller.js?v=2024-06';

export default class Index extends Controller {
    #websrcs = ["watch", "flashboang"];

    _constructor() {
        this.defaults.externalLinks = false;
        this.defaults.header = false;
        this.defaults.footer = false;
        
        this.defaults.app.css = [
            "./assets/css/style.css"
        ];
        this.defaults.app.js = [
            "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
        ];

        this.parameters = new URLSearchParams(window.location.search);
        this.userAgent = navigator.userAgent.toLowerCase();
        this.embeded = window.self !== window.top;
    }

    async index() {
        
        this.notFound();

    }
    
}