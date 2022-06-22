//#region Variables

//import { CourierClient } from "@trycourier/courier";

/**
 * Sitemap URL.
 */
//const siteMapPath = "https://7daystodiemods.com/post-sitemap.xml";
const siteMapPath = "https://7daystodiemods.com/post-sitemap.xml";
const { exec } = require("child_process");

/**
 * Programwide XML parser.
 */
 const parserXML = require('xml2js').parseString;

/**
 * Client for parsing HTML.
 */
 const parserHTML = require('cheerio');

/**
 * Client for obtaining remote files.
 */
 const got = require('got');

/**
 * Library for working with date and time.
*/
const DateTime = require('moment');

/**
 * HTML to MD parser.
*/
const NHMO = require('node-html-markdown');

/**
* Object for HTML to MD parsing.
*/
const parserMD = new NHMO.NodeHtmlMarkdown();

const nodemail = require('nodemailer');

const rimraf = require('rimraf');

const modsPath = "./Mods";

/***************************************/

/**
 * Variable for stroing sitemap as parsed XML.
 */
var siteMapXML;

/**
 * Last timestamp from sitemap.
 */
var sitemapTimestamp;

/**
 * Two dimensional array for storing mod timestamps and URLs.
 * @type {Map<string,ModData>} 
 */
var modDataArray = new Map();

/**
 * Constant that defines update frequency in hours
 */
const timeForUpdate = 4;

/**
 * Var for full day calc.
*/ 
var fullDayPeriod;

var fs = require('fs');


class ModData{
    constructor(modURL, modTimestamp, modName){
        this.modURL = modURL;
        this.modTimestamp = modTimestamp;
        this.modName = modName;
    }
}

/**
 * This class serves the purpose of storing data about individual mods.
 *  @param {string} modURL - URL where mod can be found
 *  @param {string} modName - Name of the mod
 *  @param {array} modImages - Array of all images provided for given mod
 *  @param {string} modShortDescription  - Short mod description used in mod tile
 *  @param {string} modDescription - Description of given mod
 *  @param {string} modChangelog - Changelog of given mod
 *  @param {array} modDownloadURLs - Array of all provided download links
 *  @param {string} modForum - Link for forum thread for given mod
 *  @param {array} modAuthors - Array of all the mod authors, creators and contributors
 *  @param {array} modTags - Array of all the included tags
 */
class ModItem{
    constructor(modURL,modCreatedTime,modLastUpdatedTime,modName,modImages,modShortDescription,modDescription,modDownloadURLs,modPotentialyOutdated,modForumURL,modAuthors,modTags) {
        this.modURL = modURL;
        this.modCreatedTime = modCreatedTime;
        this.modLastUpdatedTime = modLastUpdatedTime;
        this.modName = modName;
        this.modImages = modImages;
        this.modShortDescription = modShortDescription;
        this.modDescription = modDescription;
        this.modDownloadURLs = modDownloadURLs;
        this.modPotentialyOutdated = modPotentialyOutdated;
        this.modForumURL = modForumURL;
        this.modAuthors = modAuthors;
        this.modTags = modTags;
    }
}

//#endregion

//#region Aditional functions

/**
 * First function to be executed.
 */
function Startup(){
    GetFullDayPeriod();
    if(fs.existsSync("variables.json")){
        sitemapTimestamp = JSON.parse(fs.readFileSync("variables.json")).siteMapTimestamp;
    }

    if(!fs.existsSync(modsPath)){
        fs.mkdirSync(modsPath);
    }

    if(fs.existsSync("./Mods/modData.json")){
        modDataArray = JSON.parse(fs.readFileSync("./Mods/modData.json"),reviver);
    }
    CheckForSiteMapUpdate();
}

function IsEmpty(path) {
    return fs.readdirSync(path).length === 0;
}

/**
 * Adds timestamp to provided string, for logging.
 * @param {string} logText - String to add timestamp to.
 * @returns Returns input string formated with current time.
 */
function TimeNow(logText){
    return DateTime.utc().format('D/MM/YYYY | H:mm:ss') + " | " + logText;
}

/**
 * Calculates how many updates there are in a day.
 */
function GetFullDayPeriod(){
    fullDayPeriod = 24/timeForUpdate;
}

/**
 * Synchronous delay.
 * @param {int} delay - In miliseconds
 */
function Sleep(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() < start + delay);
}

/**
 *  This function periodicly checks for updates to sitemap in order to spot any new mods.
 */
 function CheckForSiteMapUpdate(){
    console.log(TimeNow("Checking for sitemap updates..."));
    LoadSitemapAsString();
}

//#endregion

//#region Data processing 

/**
 * This function extracts all tag from page.
 * @param {parserHTML.CheerioAPI} attribut 
 * @returns {array} Array of all the tags.
 */
 function ProcessModTags(attribut){
    var tagArray = [];
    attribut('a').each((i,e) =>{
        tagArray[i] = attribut(e).text();
    });
    return tagArray;
}

/**
 * Checks if mod was last updated before the release of A19. Marking the mod as potentialy outdated.
 * @param {number} lasUpdateTime 
 * @returns {bool} If mod is potentialy outdated.
 */
function CompareDates(lasUpdateTime){
    if(lasUpdateTime < Date.parse("19 Aug 2021 00:00:00 GMT"))
    {
        return true;
    }
    else
    {
        return false;
    }

}

/**
 * Finds and marks all download links.
 * @param {parserHTML.CheerioAPI} attribut 
 * @returns {array} Array of mod download links.
 */
function ProcessModDownloadURLs(attribut){
    var localArray = [];

    var localParent = attribut('a:contains(Download)').parent().parent();
    var wholeText = localParent.toString().replace('<p>',"").replace('</p>',"").split('<br>');
    for (let i = 0; i < wholeText.length; i++) {
        wholeText[i] = "<fake>" + wholeText[i] + "</fake>";
        var temp = parserHTML.load(wholeText[i],null,false);
        localArray[i] = {
            Info: temp('fake').text().replace("Download ",""),
            URL: temp('fake > strong > a').attr('href'),
            Version: temp('fake').text().includes("18") ? "v18" : temp('fake').text().includes("17") ? "v17" : "v19"
        };
    }
    return localArray;
}

/**
 * Extracts forum link from page.
 * @param {parserHTML.CheerioAPI} attribut 
 * @returns {string} Forum link
 */
function ProcessModForumURL(attribut) {
    try {
        attribut = attribut('p:contains(The forum topic of the mod is) > a').attr('href');
    } catch (error) {
        attribut = "noURL";
        throw error;
    }
    return attribut;
}

/**
 * Extracts all the mod authors from page.
 * @param {parserHTML.CheerioAPI} attribut
 * @returns {array} Returns array of all the mod authors.
 */
function ProcessModAuthors(attribut){
    attribut = attribut('strong:contains(Credits:)').parent().text();
    attribut = attribut.replace("Credits: ","");
    attribut = attribut.split(',');
    for (let i = 0; i < attribut.length; i++) {
        attribut[i] = attribut[i].trim();
    }
    return attribut;
}

/**
 * Extaracts mod description.
 * @param {parserHTML.CheerioAPI} attribut 
 * @returns {string} Parsed MD description of mod.
 */
function ProcessModDescriptionFromPage(attribut){
    attribut('.addtoany_share_save_container').remove();
    attribut('.ai-viewports').remove();
    attribut('img').remove();
    var mdDescription = parserMD.translate(attribut('div').html());
    return mdDescription;
}

/**
 * Extracts all images from mod page.
 * @param {arserHTML.CheerioAPI} attribut 
 * @returns {array} Array of all the mod images.
 */
function ProcessModImagesFromPage(attribut) {
    var imageList = [];
    var locattribut = parserHTML.load(attribut,null,false);
    attribut('img').each(function (i, elem){
        imageList[i] = attribut(this).attr('data-src');
    });
    return imageList;
}

/**
 * Trims mod name.
 * @param {string} attribut - Mod name
 * @returns {string} Trimmed mod name.
 */
function ProcessModNameFromPage(attribut){
    var loc = attribut.replace(':',' ');
    loc = loc.replace('"','')
    return loc.substr(0,attribut.length-21);
}

//#endregion

//#region Body

/**
 * Converts sitemap to string.
 */
 function LoadSitemapAsString(){
    console.log(TimeNow("Obtaining sitemap..."));
    (async () => {
        try {
            const response = await got(siteMapPath);
            parserXML(response.body, (error, result) =>{
                siteMapXML = result;
            })
            //=> '<!doctype html> ...'
        } catch (error) {
            console.log(TimeNow(error.response.body));
            //=> 'Internal server error ...'
        }
    })().then(()=>{
        console.log(TimeNow("Sitemap obtained."));
        GetSiteMapTimestamp();});
}   

/**
 *  Gets timestamp from sitemap url and decides further action.
 */
 function GetSiteMapTimestamp(){
    const element = siteMapXML['urlset']['url'][0];
    if(element['lastmod'] == sitemapTimestamp && fullDayPeriod < 24 && sitemapTimestamp != undefined)
    {
        console.log(TimeNow("The sitemap is up-to-date. Next check is planned in "+timeForUpdate+" hour/s"));
        setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
    }
    else if(element['lastmod'] != sitemapTimestamp){
        console.log(TimeNow("Current mod list is outdated"));
        setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
        UpdateModObjects();
    }
    else if(fullDayPeriod == 24 && sitemapTimestamp != undefined)
    {
        console.log(TimeNow("Commencing daily backup timestamp validation..."));
        if(modDataArray.length == siteMapXML['urlset']['url'].length)
        {
            console.log(TimeNow("Daily backup check has been succesfully completed."));
            fullDayPeriod = 0;
            setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
        }
        else
        {
            console.log(TimeNow("There has been difference in local and server sided amount of links."));
            setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
            UpdateModObjects();
        }
    }
    else if(sitemapTimestamp == undefined)
    {
        console.log(TimeNow("Local timestamp has not been found."));
        setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
        UpdateModObjects();
    }
    
}

function UpdateModObjects()
{
    var newLenght = siteMapXML['urlset']['url'].length - 960;

    sitemapTimestamp = siteMapXML['urlset']['url'][0]['lastmod'];
    fs.writeFileSync("variables.json",JSON.stringify({siteMapTimestamp:sitemapTimestamp}));

    var tempArray = [];

    for (let i = 1; i < newLenght; i++) {
        var currentElement = siteMapXML['urlset']['url'][i]
        var url = currentElement['loc'].toString();
        var timestamp = currentElement['lastmod'].toString();
        if(modDataArray.has(url) && modDataArray.get(url).modTimestamp == timestamp){
            continue
        }

        tempArray.push(url);
        
    }

    var i = 1;
    var p = setInterval(() => {
        if(i < tempArray.length){
        GetModPage(tempArray[i],i,tempArray.length);
        i++;
        }
        else{
            console.log(TimeNow("All mods have been processed. The next check will ocure in ~2 hours."));
            fs.writeFileSync("./Mods/modData.json",JSON.stringify(modDataArray,replacer));
            exec('git add . && git commit -m "mods update'+ DateTime.utc().format('D/MM/YYYY H_mm_ss')+'" && git push', (error, stdout, stderr) => {
                /*if (error) {
                    console.log(`error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    return;
                }*/
            });
            clearInterval(p);
        }
    },
    500
    );  
}

function GetModPage(url,id,amount)
{
    var $;
    var $modURL;
    var $modCreatedTime;
    var $modLastUpdateTime;
    var $modName;
    var $modImages = [];
    var $modShortDescription;
    var $modDescription;
    var $modDownloadURLs;
    var $modPotentialyOutdated;
    var $modForumURL;
    var $modAuthors;

    //console.log(TimeNow("Obtaining: " + url));
    var startTime = DateTime.utc();

    (async () => {
            await got(url).then(
                response => {
                $ = parserHTML.load(response.body);
                $modURL = url;
                $modCreatedTime = $('meta[property=article:published_time]').attr('content');
                $modLastUpdateTime = $('meta[property=article:modified_time]').attr('content');
                $modName = ProcessModNameFromPage($('meta[property=og:title]').attr('content'));

                if(modDataArray.has(url))
                {
                    var v = modDataArray.get(url);
                    v.modTimestamp = $modLastUpdateTime;
                    modDataArray.set(url, v);
                }
                else
                {
                    modDataArray.set(url,new ModData(url,$modLastUpdateTime,$modName.toString().replace(/\s/g, "_").replace(/\//g,"_")));
                }
                    
                
                $modImages = ProcessModImagesFromPage(parserHTML.load($('article > div > p > img').toString(),null,false));
                $modShortDescription = $('meta[name=description]').attr('content');
                $modDescription = ProcessModDescriptionFromPage(parserHTML.load($('article > div.entry-content').toString(),null,false));
                $modDownloadURLs = ProcessModDownloadURLs(parserHTML.load($('article > div.entry-content').toString()));
                $modPotentialyOutdated = CompareDates(Date.parse($modLastUpdateTime));
                $modForumURL = ProcessModForumURL(parserHTML.load($('article > div.entry-content').toString()));
                $modAuthors = ProcessModAuthors(parserHTML.load($('article > div.entry-content > p:last-of-type').toString()));
                $modTags = ProcessModTags(parserHTML.load($('article > footer.entry-footer > div.tags-links').toString(),null,false));
                }); 
                process.stdout.write(TimeNow(id + "/" + amount)+ " | " + $modName.padEnd(100) +"\r");
                WriteObject(new ModItem($modURL,$modCreatedTime,$modLastUpdateTime,$modName,$modImages,$modShortDescription,$modDescription,$modDownloadURLs,$modPotentialyOutdated,$modForumURL,$modAuthors,$modTags));
    })();
}



function reviver(key, value) {
    if(typeof value === 'object' && value !== null) {
      if (value.dataType === 'Map') {
        return new Map(value.value);
      }
    }
    return value;
  }


function replacer(key, value) {
if(value instanceof Map) {
    return {
    dataType: 'Map',
    value: Array.from(value.entries()), // or with spread: value: [...value]
    };
} else {
    return value;
}
}



/**
 * 
 * @param {ModItem} obj 
 */
function WriteObject(obj){
    var fileName = "./Mods/"+obj.modName.toString().replace(/\s/g, "_").replace(/\//g,"_") + ".JSON";
    if(fs.existsSync(fileName))
    {
        fs.unlinkSync(fileName);
        createFile(fileName,obj);
    }
    else
    {
        createFile(fileName,obj);
    }
}

/**
 * 
 * @param {string} filePath 
 * @param {ModItem} obj 
 */
function createFile(filePath, obj){
    fs.writeFileSync(filePath,JSON.stringify(obj,null,2),function (err,data) {
        if (err) {
          return console.log(err);
        }
        console.log(data);
      });
}

try {
    Startup();
} catch (error) {
    console.log(error);

    /*var sendmail = require('sendmail')({silent: false});
    sendmail({
      from: 'yessenia.gaylord50@ethereal.email',
      to: 'Lukáš Nebeský <lukas.the.nebesky@gmail.com>',
      subject: 'Error in your application', // Subject line
      html: 'Hi,\r\n an error has occured in your application and it has cessed to work. \r\n Please, check your application as soon as possible.\r\n \r\n See the error bellow: \r\n \r\n' + error + ' \r\n \r\n Thank you. ',
    }, function (err, reply) {
      //console.log(err && err.stack)
      //console.dir(reply)
    });

        /*const transporter = nodemail.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: 'yessenia.gaylord50@ethereal.email',
                pass: 'K536VHdm2rUAjXYwRk'
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    
        const message = {
            from: 'Lukáš Nebeský Node.JS server <uwuw@ethereal.email>',
            to: 'Lukáš Nebeský <lukas.the.nebesky@gmail.com>',
            subject: 'There\'s been an error in your application.',
            text: 'Hi,\r\n an error has occured in your application and it has cessed to work. \r\n Please, check your application as soon as possible.\r\n \r\n See the error bellow: \r\n \r\n' + error + ' \r\n \r\n Thank you. '
        };
    
        transporter.sendMail(message, (err, info) => {
            if (err) {
                console.log('Error occurred. ' + err.message);
            }
    
            console.log('Message sent: %s', info.messageId);
            // Preview only available when sending through an Ethereal account
            console.log('Preview URL: %s', nodemail.getTestMessageUrl(info));
        });*/
}