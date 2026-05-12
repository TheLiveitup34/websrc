export default class Verifyer {

    constructor() {

    }

    async validateEmail(email) {
        let reason;
        let valid = false;
        const domains = [
        /* Default domains included */
        "aol.com", "att.net", "comcast.net", "facebook.com", "gmail.com", "gmx.com", "googlemail.com",
        "google.com", "hotmail.com", "hotmail.co.uk", "mac.com", "me.com", "mail.com", "msn.com",
        "live.com", "sbcglobal.net", "verizon.net", "yahoo.com", "yahoo.co.uk",

        /* Other global domains */
        "email.com", "fastmail.fm", "games.com" /* AOL */, "gmx.net", "hush.com", "hushmail.com", "icloud.com",
        "iname.com", "inbox.com", "lavabit.com", "love.com" /* AOL */, "outlook.com", "pobox.com", "protonmail.ch", "protonmail.com", "tutanota.de", "tutanota.com", "tutamail.com", "tuta.io",
        "keemail.me", "rocketmail.com" /* Yahoo */, "safe-mail.net", "wow.com" /* AOL */, "ygm.com" /* AOL */,
        "ymail.com" /* Yahoo */, "zoho.com", "yandex.com",

        /* United States ISP domains */
        "bellsouth.net", "charter.net", "cox.net", "earthlink.net", "juno.com",

        /* British ISP domains */
        "btinternet.com", "virginmedia.com", "blueyonder.co.uk", "freeserve.co.uk", "live.co.uk",
        "ntlworld.com", "o2.co.uk", "orange.net", "sky.com", "talktalk.co.uk", "tiscali.co.uk",
        "virgin.net", "wanadoo.co.uk", "bt.com",

        /* Domains used in Asia */
        "sina.com", "sina.cn", "qq.com", "naver.com", "hanmail.net", "daum.net", "nate.com", "yahoo.co.jp", "yahoo.co.kr", "yahoo.co.id", "yahoo.co.in", "yahoo.com.sg", "yahoo.com.ph", "163.com", "yeah.net", "126.com", "21cn.com", "aliyun.com", "foxmail.com",

        /* French ISP domains */
        "hotmail.fr", "live.fr", "laposte.net", "yahoo.fr", "wanadoo.fr", "orange.fr", "gmx.fr", "sfr.fr", "neuf.fr", "free.fr",

        /* German ISP domains */
        "gmx.de", "hotmail.de", "live.de", "online.de", "t-online.de" /* T-Mobile */, "web.de", "yahoo.de",

        /* Italian ISP domains */
        "libero.it", "virgilio.it", "hotmail.it", "aol.it", "tiscali.it", "alice.it", "live.it", "yahoo.it", "email.it", "tin.it", "poste.it", "teletu.it",

        /* Russian ISP domains */
        "mail.ru", "rambler.ru", "yandex.ru", "ya.ru", "list.ru",

        /* Belgian ISP domains */
        "hotmail.be", "live.be", "skynet.be", "voo.be", "tvcablenet.be", "telenet.be",

        /* Argentinian ISP domains */
        "hotmail.com.ar", "live.com.ar", "yahoo.com.ar", "fibertel.com.ar", "speedy.com.ar", "arnet.com.ar",

        /* Domains used in Mexico */
        "yahoo.com.mx", "live.com.mx", "hotmail.es", "hotmail.com.mx", "prodigy.net.mx",

        /* Domains used in Canada */
        "yahoo.ca", "hotmail.ca", "bell.net", "shaw.ca", "sympatico.ca", "rogers.com",

        /* Domains used in Brazil */
        "yahoo.com.br", "hotmail.com.br", "outlook.com.br", "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "itelefonica.com.br", "r7.com", "zipmail.com.br", "globo.com", "globomail.com", "oi.com.br"
        ];

        if (email.indexOf('@') > -1) {
            let domain = email.split('@')[1];
            
            if (domains.includes(domain)) {
                
                if (email == "email@gmail.com") {// Will change to api verification

                    // Validate Email
                    valid = true;

                } else {reason = "This email is incorrect or invalid!"}

            } else {reason = "Must be a valid Email!"}

        }  else { reason = "Email must not be empty!"}

        return {alert: reason,success:valid};
    }

    async validatePwd(pwd) {

        // Gets SHA-1 Hexcode Hash
        let sha1 = await this.encrypt('SHA-1', pwd);
        let sha1End = sha1.slice(5, sha1.length).toUpperCase();

        // Checks to see if a password has been in a breach
        let checkBreach = await fetch(`https://api.pwnedpasswords.com/range/${sha1.substring(0,5)}`, {mode: 'cors', cache: 'no-cache'});
        checkBreach = await checkBreach.text();

        // Checks return to 
        const regex = new RegExp(`${sha1End}:(.*)`);
        let breached = checkBreach.match(regex);
        
        if (breached == null) {

            if (pwd == pwd) { // Verify Api Process
                alert("You did a thing");
                return true;
            } else {
                M.toast({html: 'Password is invalid!', classes: 'red darken-4'})
            }

        } else {
            M.toast({html: 'This password is very insecure, please change password!', classes: 'red darken-4'});
        }
        return false;
    }
    async isBreached(pwd) {
         // Gets SHA-1 Hexcode Hash
        let sha1 = await this.encrypt('SHA-1', pwd);
        let sha1End = sha1.slice(5, sha1.length).toUpperCase();

        // Checks to see if a password has been in a breach
        let checkBreach = await fetch(`https://api.pwnedpasswords.com/range/${sha1.substring(0,5)}`, {mode: 'cors', cache: 'no-cache'});
        checkBreach = await checkBreach.text();

        // Checks return to 
        const regex = new RegExp(`${sha1End}:(.*)`);
        let breached = checkBreach.match(regex);
        
        if (breached == null) {

            return true;


        } else {
            M.toast({html: 'This password is very insecure, please change password!', classes: 'red darken-4'});
        }
        return false;
    }

    async resetEmail(email) {
        let reason;
        let valid = false;

        if (email.indexOf('@') > -1) {

            if (email == "email@gmail.com") {// Will change to api verification

                // Validate Email
                valid = true;

            } else {
                valid = true;
            }


        }  else { reason = "Must Be a valid Email!"}

        return {alert: reason,success:valid};
    }

    

    async encrypt(algorithm, text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest(algorithm, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer)); 
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); 
        return hashHex;
    }
}