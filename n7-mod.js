
const Convnetjs = require('convnetjs')
//const z = require('zero-fill')
//const stats = require('stats-lite')
//const n = require('numbro')
const math = require('mathjs')
//const cluster = require('cluster');
//const numCPUs = require('os').cpus().length;
//const _ = require('lodash');
//const deepqlearn = require('convnetjs/build/deepqlearn');
const log = require('../core/log.js');

global.forks = 0 // starts you at 0 threads
let oldmean = 0 // calculating the last mean vs the now mean

// getOption = () => {}
 
var method = {}; // let's create our own method
options = {
  //period: "1m",
  period_length: "1m",
  activation_1_type: 'regression',
  neurons_1: 25,
  depth :1,
  //selector: "Gdax.BTC-USD",
  //min_periods: 1500,
  //min_predict: 1,
  momentum: 0.2,
  decay: 0.1,
  //threads: 4,
  //learns: 2
}

//[myStoch]
//highThreshold = 80
//lowThreshold = 20
//optInFastKPeriod = 14
//optInSlowKPeriod = 5
//optInSlowDPeriod = 5
// 
//[myLongEma]
//optInTimePeriod = 100
// 
//[myShortEma]
//optInTimePeriod = 50
// 
//[stopLoss]
//percent = 0.9
 
let hasbought = false;
const stochParams = {
  optInFastKPeriod: 8,
  optInSlowKPeriod: 3,
  optInSlowDPeriod: 3
};
 
 
let neural = undefined;
// prepare everything our method needs
method.init = () => {
  this.requiredHistory = this.tradingAdvisor.historySize;
  this.addTulipIndicator('stoch', 'stoch', stochParams);

  // Create the net the first time it is needed and NOT on every run
  if (neural === undefined) {
    neural = {
      net: new Convnetjs.Net(),
      layer_defs : [
        { type: 'input', out_sx: 4, out_sy: 4, out_depth: options.depth },
        { type: 'fc', num_neurons: options.neurons_1, activation: options.activation_1_type },
        { type: 'regression', num_neurons: 5 }
      ],
      neuralDepth: options.depth
    }
    neural.net.makeLayers(neural.layer_defs);
    neural.trainer = new Convnetjs.SGDTrainer(neural.net, { 
      learning_rate: 0.05,
      momentum: options.momentum,
      batch_size: 10,
      l2_decay: options.decay
    });
  }
}
 
 
 
let haspredicted = false;
let predictioncount = 0;
let maxaccuracy = 0;
let lowaccuracy = 0;
let highpeak = 6;
let lowpeak = -100;
 
// what happens on every new candle?
method.update = (candle) => {
  this.HCL = (this.candle.high + this.candle.close + this.candle.open) /3;
  Price.push(candle.close);
  if(Price.length > 2) {
    // var tlp = []
    // var tll = []
    const my_data = Price;

    const learn = () => {
      for (let i = 0, len = Price.length; i < len - 1; i++) {
        const data = my_data.slice(i, i + 1);
        const real_value = [my_data[i + 1]];
        const x = new convnetjs.Vol(data);
        neural.trainer.train(x, real_value);
        const predicted_values =neural.net.forward(x);
        const accuracy = predicted_values.w[0] -real_value
        const accuracymatch = predicted_values.w[0] == real_value;
        //const rewardtheybitches = neural.net.backward(accuracymatch);

        if(accuracy > 0 && accuracy > maxaccuracy) maxaccuracy = accuracy
        if(accuracy < 0 && accuracy < lowaccuracy) lowaccuracy = accuracy
    
        predictioncount++;
        haspredicted = true;
      }
    }
    learn();
    //
      // var json = neural.net.toJSON();
      // // the entire object is now simply string. You can save this somewhere
      // var str = JSON.stringify(json);
      // log.debug(str);
  }
}

method.log = () => {}
method.handleposition  = () => {}


let Price = [];
const percentCalculator = (num, amount) => num * amount/100;
const ManageSize = () => {
  const calculatedPercent = percentCalculator(Price.length, 5);
  Price.splice(0, calculatedPercent);
}

method.check = () => {
  this.stochK = this.tulipIndicators.stoch.result.sotchK;
  this.stochD = this.tulipIndicators.stoch.result.stochD;
 
  //Learn
  const predict = (data) => {
    var x = new convnetjs.Vol(data);
    var predicted_value = neural.net.forward(x);
    return predicted_value.w[0];
  }
 
  this.HCL = (this.candle.high + this.candle.close + this.candle.open) /3;

  if(haspredicted & predictioncount > 1000) {
    const item = Price;
    let prediction = predict(item)
    let mean = Price[Price.length -1];
    oldmean = prediction
    let meanp = math.mean(prediction, mean)
    global.meanp = meanp
    global.mean = mean
    let percentvar = (meanp-mean) / mean * 100;
  
    if(percentvar < 0) {
      prediction += lowaccuracy;
      percentvar += lowaccuracy;
      if(lowpeak > percentvar) lowpeak = percentvar
    }

    if(percentvar > 0) {
      prediction -= maxaccuracy;
      percentvar -= maxaccuracy;
      if(highpeak < percentvar) highpeak = percentvar
    }

    log.debug("IA - Buy - Predicted variation: ",percentvar);
    global.sig0 = global.meanp < global.mean && meanp != 0;
    if (global.sig0 === false  && percentvar > 1.70 ) {
      log.debug("IA - Buy - Predicted variation: ", percentvar);
      hasbought = true;
      meanp = 0
      mean = 0;
      haspredicted = false;
      ManageSize();
      return this.advice('long');
    } else if (global.sig0 === true && percentvar < -0.90) {
      log.debug("IA - Sell - Predicted variation: ", percentvar);
      meanp = 0
      mean = 0;
      hasbought = false;
      haspredicted = false;
      return this.advice('short');
    }
  }

}
 
module.exports = method;
