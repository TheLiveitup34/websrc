import Controller from '../libraries/Controller.js?v=2024-06';

export default class Dashboard extends Controller {
    #websrcs = ["watch", "flashboang"];

    _constructor() {
        this.defaults.externalLinks = false;
        
        this.defaults.app.css = [
            "./assets/css/style.css"
        ];


    }

    async index() {
        await this.view('dashboard')
    }


    
}