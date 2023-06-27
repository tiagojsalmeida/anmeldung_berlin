const fs = require('fs');
const puppeteer = require('puppeteer');
var growl = require('growl');
const open = (...args) => import('open').then(({default: open}) => open(...args));

const config = {
    'debug': !true,
    'continueForever': !false, //Crawler will keep notifying you after finding one appointment
    'automaticallyOpenAppointmentOnSafari': !true, //If available appointment, safari will open that link
    'minTimestamp': new Date("Jun 1 2023").getTime() / 1000,// Use Berlin time-zone here
    'maxTimestamp': new Date("Sep 1 2023").getTime() / 1000,// Use Berlin time-zone here
    'takeScreenshot': true,
    'screenshotFile1': 'screenshot1.png',
    'screenshotFile2': 'screenshot2.png',
    'logFile': 'logFile.txt',
    'timeout': 30000
};

const staticConfig = {
    'entryUrl': 'https://service.berlin.de/terminvereinbarung/termin/tag.php?termin=1&anliegen[]=120686&dienstleisterlist=122210,122217,327316,122219,327312,122227,327314,122231,327346,122243,327348,122252,329742,122260,329745,122262,329748,122254,329751,122271,327278,122273,327274,122277,327276,122280,327294,122282,327290,122284,327292,327539,122291,327270,122285,327266,122286,327264,122296,327268,150230,329760,122301,327282,122297,327286,122294,327284,122312,329763,122304,327330,122311,327334,122309,327332,122281,327352,122279,329772,122276,327324,122274,327326,122267,329766,122246,327318,122251,327320,122257,327322,122208,327298,122226,327300',
};


(async() => {
    if(shouldBook()){
        console.log('----');
        console.log('Starting: ' + new Date(Date.now()).toTimeString());
        startBooking();
    }
})();

async function startBooking() {
     let success = await bookTermin();
     if (!success) {
       setTimeout(startBooking, 30*1000);
     }
}

function shouldBook() {
    if(!fs.existsSync(config.logFile)){
        return true;
    } else {
        return false;
    }
}

async function saveTerminBooked() {
    await fs.writeFileSync(config.logFile, JSON.stringify({ 'booked': Date.now() }), 'utf8');
}

async function bookTermin() {
    const browser = await puppeteer.launch({
  		  headless: !config.debug,
        defaultViewport: null,
        ignoreHTTPSErrors: true,
        slowMo: config.debug ? 250 : 0,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certifcate-errors',
          '--ignore-certifcate-errors-spki-list',
          '--incognito',
          '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
        ]
  	});
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if(req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font'){
            req.abort();
        } else {
            req.continue();
        }
    });

    let success = false;

    try{
        await page.goto(staticConfig.entryUrl);

        await page.waitForSelector('div.span7.column-content', { timeout: config.timeout });

        // Check if there are Termins available
        let available = (await page.$$('td.buchbar')).length;

        // If no Termins available, move to next month
        if(available == 0){
            console.log('Trying next month');
            await page.waitForSelector('th.next > a', { timeout: config.timeout });
            await page.click('th.next > a');
            available = (await page.$$('td.buchbar')).length;
        }

        // If there are bookable Termins
        if(available > 0){
            let dates = await page.$$('td.buchbar');
            for(let i=0;i<available;i++){
                let link = await dates[i].$eval('a', el => el.getAttribute('href'));
                let fullLink = 'https://service.berlin.de' + link

                // Checking if Termins are within desirable range
                let regex = /\d+/g;
                let matches = link.match(regex);
                let date = Number(matches[0])
                let dateString = new Date(date * 1000).toISOString().split('T')[0]

                if(matches.length > 0 && date > config.minTimestamp && date < config.maxTimestamp){
                    console.log('Date: ' + dateString + '; Link ' + i + ': ' + fullLink);
                    growl('Appointment found for ' + dateString, { sticky: true });

                    if(config.automaticallyOpenAppointmentOnSafari)
                        open(link, {app: {name: 'safari', arguments: ['--incognito']}});

                    if(!config.continueForever)
                        success = true;
                        break
                }
            }
        }
    } catch (err) {
        console.log(err);
    }
    browser.close();
    return success;
}
