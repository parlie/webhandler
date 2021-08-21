//#region Variables

//import { CourierClient } from "@trycourier/courier";

/**
 * Sitemap URL.
 */
const siteMapPath = "https://7daystodiemods.com/post-sitemap.xml";

/**
 * Library for working with date and time.
 */
const DateTime = require('moment');

const modsPath = "./Mods";

/**
 * Variable for stroing sitemap as parsed XML.
 */
var siteMapXML;

/**
 * Last timestamp from sitemap.
 */
var siteMapTimestamp;

/**
 * Programwide XML parser.
 */
const parserXML = require('xml2js').parseString;

/**
 * Client for obtaining remote files.
 */
const got = require('got');

/**
 * Client for parsing HTML.
 */
const parserHTML = require('cheerio');

/**
 * HTML to MD parser.
 */
const NHMO = require('node-html-markdown');

/**
 * Object for HTML to MD parsing.
 */
const parserMD = new NHMO.NodeHtmlMarkdown();

/**
 * Two dimensional array for storing mod timestamps and URLs.
 */
var modURLsTimestamps = [];

/**
 * Constant that defines update frequency in hours
 */
const timeForUpdate = 4;

/**
 * Var for full day calc.
*/ 
var fullDayPeriod;

var fs = require('fs');

const nodemail = require('nodemailer');

const rimraf = require('rimraf');

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
    if(fs.existsSync(modsPath)){
        if(!IsEmpty(modsPath)){
            try{
            fs.readdirSync(modsPath).forEach(file => {
                var mod = JSON.parse(fs.readFileSync(modsPath + "/" + file));
                modURLsTimestamps.push([file.split("-")[0],mod.modLastUpdatedTime,mod.modURL]);
            });
            //console.log(modURLsTimestamps);
        } catch(error){
             console.log(error);
            }
        }
    }
    else
    {
        fs.mkdirSync(modsPath);
    }
   // console.log(modURLsTimestamps);
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
    return DateTime.utc().format('D/MM/YYYY | h:mm:ss') + " | " + logText;
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
    return attribut.substr(0,attribut.length-21);
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
    if(element['lastmod'] == siteMapTimestamp && fullDayPeriod < 24 && siteMapTimestamp != undefined)
    {
        console.log(TimeNow("The sitemap is up-to-date. Next check is planned in "+timeForUpdate+" hour/s"));
        setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
    }
    else if(fullDayPeriod == 24 && siteMapTimestamp != undefined)
    {
        console.log(TimeNow("Commencing daily backup timestamp validation..."));
        if(modURLsTimestamps.length == siteMapXML['urlset']['url'].length)
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
    else if(siteMapTimestamp == undefined)
    {
        console.log(TimeNow("Local timestamp has not been found."));
        setTimeout(CheckForSiteMapUpdate,timeForUpdate*3600000);
        FirstTimeUpdate();
    }
    
}

function FirstTimeUpdate(){
    var modAmount = siteMapXML['urlset']['url'].length-1;
    siteMapTimestamp = siteMapXML['urlset']['url'][0]['lastmod'];
    var i = 1;
    var p = setInterval(() => {
        if(i < modAmount){
        GetModPage(siteMapXML['urlset']['url'][i]['loc'].toString(),i,modAmount);
        i++;
        }
        else{
            console.log(TimeNow("All mods have been processed. The next check will ocure in ~2 hours."));
            clearInterval(p);
        }
    },
    500
    );
    //console.log(TimeNow("All mods have been processed."))
}

function UpdateModObjects()
{
    var currentLenght = modURLsTimestamps.length;
    var newLenght = siteMapXML['urlset']['url'].length - 1;

    siteMapTimestamp = siteMapXML['urlset']['url'][0]['lastmod'];

    var tempArray = [];


    if(modURLsTimestamps.length < 1){
        FirstTimeUpdate();
    }
    else if(currentLenght < newLenght){

        var tempCurrentLenght = currentLenght;
        while(tempCurrentLenght < newLenght)
        {
            tempArray.push(siteMapXML['urlset']['url'][tempCurrentLenght+1].toString());
            tempCurrentLenght++;
        }
    }

    for (let i = 1; i < modURLsTimestamps.length; i++) {
        if(modURLsTimestamps[i][0] != siteMapXML['urlset']['url'][i]['lastmod'])
        {
            tempArray.push(siteMapXML['urlset']['url'][i]['loc'].toString(),modURLsTimestamps[i][0]);
        }
    }
    var i = 1;
    var p = setInterval(() => {
        if(i < tempArray.length){
        GetModPage(tempArray[i][0],tempArray[i][1],tempArray.length);
        i++;
        }
        else{
            console.log(TimeNow("All mods have been processed. The next check will ocure in ~2 hours."));
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
                $modURL = $('meta[property=og:url]').attr('content');
                $modCreatedTime = $('meta[property=article:published_time]').attr('content');
                $modLastUpdateTime = $('meta[property=article:modified_time]').attr('content');

                if(modURLsTimestamps[id] == $modURL)
                {
                    modURLsTimestamps[id] = [id,$modLastUpdateTime,$modURL];
                }
                else
                {
                    modURLsTimestamps.push([id,$modLastUpdateTime,$modURL]);
                }
                    
                
                $modName = ProcessModNameFromPage($('meta[property=og:title]').attr('content'));
                $modImages = ProcessModImagesFromPage(parserHTML.load($('article > div > p > img').toString(),null,false));
                $modShortDescription = $('meta[name=description]').attr('content');
                $modDescription = ProcessModDescriptionFromPage(parserHTML.load($('article > div.entry-content').toString(),null,false));
                $modDownloadURLs = ProcessModDownloadURLs(parserHTML.load($('article > div.entry-content').toString()));
                $modPotentialyOutdated = CompareDates(Date.parse($modLastUpdateTime));
                $modForumURL = ProcessModForumURL(parserHTML.load($('article > div.entry-content').toString()));
                $modAuthors = ProcessModAuthors(parserHTML.load($('article > div.entry-content > p:last-of-type').toString()));
                $modTags = ProcessModTags(parserHTML.load($('article > footer.entry-footer > div.tags-links').toString(),null,false));
                }); 
                process.stdout.write(TimeNow(id + "/" + amount)+ " | " + $modName.padEnd(50) +"\r");
                WriteObject(id-1,new ModItem($modURL,$modCreatedTime,$modLastUpdateTime,$modName,$modImages,$modShortDescription,$modDescription,$modDownloadURLs,$modPotentialyOutdated,$modForumURL,$modAuthors,$modTags));
    })();
}

/**
 * 
 * @param {ModItem} obj 
 */
function WriteObject(modID,obj){
    var fileName = "./Mods/" + modID + "-" + obj.modName.toString().replace(/\s/g, "_").replace(/\//g,"_") + ".JSON";
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