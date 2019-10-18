'v0.2.0';
(function(undefined){
  'use strict';
  
  //useful fns
  function loop(obj, callable){
    for(var k in obj){
      if(obj.hasOwnProperty(k)){
        if(callable.call(obj[k], k, obj[k]) === false){
          return false;
        }
      }
    }
    return true;
  }
  
  function upon(eventName, el, sel, callable){
    var options = {capture:true};
    if(callable == undefined){
      callable = sel;
      sel = undefined;
      el.addEventListener(eventName, function(e){
        return callable.call(el, e, {captureElement:el, selector:sel});
      }, options);
    }else{
      el.addEventListener(eventName, function(e){
        var ret = true;
        loop(el.querySelectorAll(sel), function(){
          if(e.target === this){
            ret = callable.call(this, e, {captureElement:el, selector:sel});
          }
        });
        return ret;
      }, options);
    }
  }
  
  /*
   * form.bopValidation = {
   *   controller : {
   *     events : {
   *       'eventName1' : {
   *         selectors : {
   *           '.selector1' : {
   *              constraints : {
   *                'missingValue' : { //or other builtin validity constraints
   *                  message : 'msg'
   *                },
   *                ...
   *                'constraintName1' : {
   *                  message : 'msg'
   *                  arguments : {'argName1' : 'val1', 'argName2' : 'val2', ...} //optional
   *                },
   *                ...
   *             }
   *           },
   *           ...
   *         }
   *       },
   *       ...
   *     },
   *   },
   *   model : {
   *     constraints : {
   *       'customName1' : function(el, args){
   *         var isValid = true;
   *         ...
   *         return isValid;
   *       },
   *       ...
   *     }
   *   },
   *   view : {
   *     valid : function(el, details){
   *       ...
   *     }
   *     invalid : function(el, firstMsg, details){
   *       ...
   *     }
   *   }
   * };
   * 
   */
  
  //var things that are gonna be used often.
  var NS = 'bopValidation';
  var ES = '.'+NS;
  var SUBMITEV = '.submit'+ES;
  
  document[NS] = function(form){
    
    if(!(NS in form)){
      return;
    }
    
    //prevent auto-form validation as it occurs before 'submit' is fired and there is no hook prior.
    form.setAttribute('novalidate', true);
    
    form[NS].promises = [];
    
    loop(form[NS].controller.events, function(eventName, eventDef){
      loop(eventDef.selectors, function(selector, selectorDef){
        
        var eventNames = eventName.split(' ');
        for(var i=0; i<eventNames.length; i++){
          //define it in this way to allow dynamically added content to benefit
          upon(eventNames[i], form, selector, function(e){
            var el = e.target;
            
            //let's make our own validity state - better than the builtin
            if(!(NS in el)){
              el[NS] = {};
            }
            if(!('validity' in el[NS])){
              el[NS].validity = {};
            }
            
            var details = {
              event : e,
              selector : selector,
              failures : {},
              msg : ''
            };
            el[NS].promises  = [];
            loop(selectorDef.constraints, function(cName, cDef){
              var failed = document[NS].resolveConstraint(el, cName, cDef);
              
              //if async, add to to the promises array.
              if(failed instanceof Promise){
                var p = failed;
                p.then(function(failed){
                  el[NS].validity[cName] = failed;
                  if(failed){
                    details.failures[cName] = cDef;
                    details.msg = cDef.message;
                  }
                });
                el[NS].promises.push(p);
              }else{
                if(failed){
                  details.failures[cName] = cDef;
                  if(!details.msg && 'message' in cDef){
                    details.msg = cDef.message;
                  }
                }
    
                el[NS].validity[cName] = failed;
              }
            });
            
            if(el[NS].promises.length){
              Promise.all(el[NS].promises).finally(function(){
                document[NS].applyView(el, details);
              });
            }
            
            document[NS].applyView(el, details);
            
          });
        }
      });
    });
    
    upon('submit', form, function(e){
      var form = this;
      var validEvent = 'valid'+SUBMITEV;
      var invalidEvent = 'invalid'+SUBMITEV;
      loop(form.querySelectorAll('*'), function(){
        this.dispatchEvent(new Event('before.submit.'+NS));
      });
      if(form[NS].promises){
        e.preventDefault();
        Promise.all(form[NS].promises).finally(function(){
          if(form.checkValidity()){
            form.dispatchEvent(new Event(validEvent));
            form.submit();
          }else{
            form.dispatchEvent(new Event(invalidEvent));  
          }
        });
      }else{
        if(this.checkValidity()){
          this.dispatchEvent(new Event(validEvent));
        }else{
          e.preventDefault();
          this.dispatchEvent(new Event(invalidEvent));
        }
      }
    });
    
  };
  
  document[NS].resolveConstraint = function(el, cName, cDef){
    var methods = el.form[NS].model.constraints;
    
    var failed = false;
    //doesn't meet custom criteria
    if(cName in methods){
      failed = methods[cName](el, 'arguments' in cDef ? cDef.arguments : {});
    //or, doesn't meet builtin criteria
    }else if(
      cName != 'customError' &&
      cName != 'valid' &&
      'validity' in el &&
      cName in el.validity &&
      el.validity[cName]
    ){
      failed = true;
    }
    
    return failed;
  };
  
  document[NS].applyView = function(el, details){
    var isValid = Object.values(el[NS].validity).indexOf(true) == -1;
    var updateMsg = Object.keys(details.failures).length;
    var msg = details.msg ? details.msg : 'Invalid.';
    
    if(updateMsg){
      el.setCustomValidity(msg);
    }else if(isValid){
      el.setCustomValidity('');
    }
              
    //view
    if('view' in el.form[NS]){
      if(isValid){
        el.form[NS].view.valid(el, details);
      }else if(updateMsg){
        el.form[NS].view.invalid(el, msg, details);
      }
    }else{
      el.reportValidity();
    }
  };
  
  document[NS].promise = function(form, resolvable){
    var p = new Promise(resolvable);
    form[NS].promises.push(p);
    return p;
  };
  
  upon('DOMContentLoaded', document, function(){
    loop(document.getElementsByTagName('form'), function(){
      document[NS](this);
    });
  });
})();
