const request = require('request')
const express = require("express");
const app = express();
const http = require("http").createServer(app)
const bodyParser = require("body-parser")
const cheerio = require('cheerio')
const fs = require('fs')
let cities = require('./weather.json')
const uuid = require('uuid-random')

app.use(bodyParser.json());

let api_key = process.env.API_KEY
const apiKey = process.env.HERE_KEY

app.post('/api_key', async function(req, res){
    if(req.body.api_key){
        api_key = req.body.api_key
        res.status(200).send({status: true, message: "Api key changed"})
    }
    else{
        res.status(301).send({status: false, message: "No api key provided"})
    }
})

app.get('/', async function(req, res){
    res.status(200).send({cities: cities, api_key: api_key})
})

app.post('/', async function(req, res){
    if(req.body.city){
        const id = uuid()
        cities.push({city: req.body.city, _id: id})
        fs.writeFileSync('./weather.json', JSON.stringify(cities))
        return res.status(200).send({status: true, message: id})
    }
    else{
        res.status(400).send({status: false, message: 'no city provided'})
    }
})

app.delete('/', async function(req, res){
    if(req.body.id){
        let index = cities.findIndex(city => city._id === req.body.id)
        if(index == -1) return res.status(400).send({status: false})
        marker({
            _id: cities[index].id,
        },'remove')
        if(index!=-1){
            cities.splice(index,1)
        }
        fs.writeFileSync('./weather.json', JSON.stringify(cities))
        res.status(200).send({status: true, message: 'deleted'})
    }
    else{
        res.status(400).send({status: false, message: "No id provided"})
    }
})

const server = 'https://fasfsa-scriptjs.e4ff.pro-eu-west-1.openshiftapps.com/api/public/map'

function has(object, key) {
    return object ? hasOwnProperty.call(object, key) : false;
}


const routes = {
    'create': 'POST',
    'edit': 'PATCH',
    'remove': 'DELETE'
}

let text = (object) => {
    let obj = new Object()
    has(object, '_id') ? obj['_id'] = object._id : null
    has(object, 'type') ? obj['type'] = object.type : null
    has(object, 'variables') ? obj['variables'] = object.variables : null
    return obj
}

async function marker(text, method){
    if(method=='delete'){
        return new Promise(async (resolve, reject) => {
            request({url: server+'delete',method: 'POST', json: {...text}, headers: {api_key: api_key, 'Accept': 'application/json', 'Content-Type': 'application/json'}}, async function(err,res,body){
                if(err){
                    console.log(err)
                }
                else{
                    resolve(await body)
                }
            })
        })
    }
    return new Promise(async (resolve, reject) => {
        request({url: server,method: routes[method], json: {...text}, headers: {api_key: api_key, 'Accept': 'application/json', 'Content-Type': 'application/json'}}, async function(err,res,body){
            if(err){
                console.log(err)
            }
            else{
                resolve(await body)
            }
        })
    })
}

async function getYandexUrl(name){
    return new Promise(async (resolve, reject) => {
        request({url: 'https://yandex.by/pogoda/search?request='+encodeURI(name)}, function(err, res, html) {
            let $ = cheerio.load(html)
            let url = $('body > div > div.content.content ancient-design yes > div.grid.clearfix > div > div.grid__cell.grid__cell_pos_1.grid__cell_size_4 > div > li > a').attr('href') || $('body > div > div.content.content_ancient-design_yes > div.grid.clearfix > div > div.grid__cell.grid__cell_pos_1.grid__cell_size_4 > div > li:nth-child(1) > a').attr('href')
            console.log(url)
            resolve('https://yandex.by'+url)
        })
    })
}
function getLocationbyAdress(address, callback){
    request({url: 'https://geocode.search.hereapi.com/v1/geocode?q='+encodeURI(address)+'&apiKey='+apiKey}, function(err,res,html){
        if(err){
            console.log(err)
        }
        else{
            callback(JSON.parse(html))
        }
    })
}

function weatherConditionsNow(link, callback){
    request({url: link}, function(err,res,html){
        var $ = cheerio.load(html)
        const conditions = {
            temp: $('div[class="temp fact__temp fact__temp_size_s"]').find($('span[class="temp__value"]')).text(),
            condition: $('div[class="link__condition day-anchor i-bem"]').text() + '\n' + $('div[class="term term_orient_h fact__feels-like"]').text(),
            place: $('body > div.b-page__container > div.content.content_compressed.content_header-only > div > nav > ol > li:nth-child(3) > span').text()
        }
        callback(conditions)
    })
}

setInterval(() => {
    cities.forEach(async (city,i) => {
        if(!city.link){
            let uri = await getYandexUrl(city.city)
            cities[i].link = uri
            city.link = uri
            fs.writeFileSync('./weather.json', JSON.stringify(cities))
        }
        weatherConditionsNow(city.link, weather => {
            if(city.id){
                marker({
                    _id: city.id,
                    type: 'marker',
                    variables: {
                        title: `Температура ${weather.temp}`,
                        description: weather.condition
                    }
                },'edit')
        }
        else{
            getLocationbyAdress(weather.place, async location => {
                if(location.items.length>0){
                    let res = await marker({
                        type: 'marker',
                        variables: {
                            title: `Температура ${weather.temp}`,
                            description: weather.condition,
                            latitude: location.items[0].position.lat,
                            longitude: location.items[0].position.lng,
                            pinColor: 'blue'
                        }
                    },'create')
                    console.log(res)
                    console.log(res.response)
                    cities[i].id = res.response._id
                    fs.writeFileSync('./weather.json', JSON.stringify(cities))
                }
                else{
                    console.log(`place ${city} not found`)
                }
            })
        }
        })
    });
}, 10*1000);

const port = process.env.PORT || 8080;
http.listen(port, () => console.log(`Listening on port ${port}...`));
