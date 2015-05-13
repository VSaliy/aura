/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*jslint sub: true */

/**
 * @description Creates an AttributeSet instance.
 * @param {Object}
 *            config Sets the values with the config object, if provided.
 * @param {Object}
 *            valueProvider Sets the value provider for the attributes.
 * @param {AttributeDefSet}
 *            attributeDefSet The metadata describing the attributes in the set.
 * @constructor
 * @protected
 */
function AttributeSet(attributes, attributeDefSet) {
	this.values = {};
    this.shadowValues={};
    this.decorators={};
	this.attributeDefSet = attributeDefSet;

	// JBUCH: HALO: TODO: Temporary Data Structures
	this.errors = {};

	this.initialize(attributes);

	// #if {"excludeModes" : ["PRODUCTION", "PRODUCTIONDEBUG"]}
	this["values"] = this.values;
	// #end
}

AttributeSet.prototype.auraType = "AttributeSet";

/**
 * Whether attribute exists
 *
 * @param {String}
 *            name - name of attribute
 * @returns {boolean} true if attribute exists
 * @private
 */
AttributeSet.prototype.hasAttribute = function(name) {
	return this.values.hasOwnProperty(name);
};

/**
 * Returns the value referenced using property syntax.
 *
 * @param {String}
 *            key The data key to look up.
 * @returns {Object} the value of the attribute
 * @protected
 *
 */
AttributeSet.prototype.get = function(key, component) {
	var value = undefined;
    if(!$A.clientService.allowAccess(this.attributeDefSet.getDef(key), component)){
        // #if {"modes" : ["DEVELOPMENT"]}
        $A.warning("Access Check Failed! AttributeSet.get(): attribute '"+key+"' of component '"+component+"' is not visible to '"+$A.getContext().getCurrentAccess()+"'.");
        // #end
        // JBUCH: TODO: ACCESS CHECKS: TEMPORARY REPRIEVE
        //return null;
    }
	if (key.indexOf('.') < 0) {
        var decorators=this.decorators[key];
        if(decorators&&decorators.length){
            if(decorators.decorating){
                value=decorators.value;
            }else{
                decorators.decorating=true;
                decorators.value=this.values[key];
                for(var i=0;i<decorators.length;i++){
                    var decorator=decorators[i];
                    value=decorator.value=decorators[i].evaluate();
                }
                decorators.decorating=false;
                decorators.value=null;
            }
        }else{
            value = this.values[key];
        }
	} else {
		value = aura.expressionService.resolve(key, this.values);
	}

	if (aura.util.isExpression(value)) {
		value = value.evaluate();
	}

    if(value instanceof ActionReferenceValue) {
        value = value.getAction();
    }

    if(this.shadowValues.hasOwnProperty(key)) {
        value += this.getShadowValue(key);
    }

	return value;
};

AttributeSet.prototype.getShadowValue=function(key){
    var value = aura.expressionService.resolve(key, this.values, true);
    if(value instanceof FunctionCallValue){
        if(this.shadowValues.hasOwnProperty(key)) {
            return this.shadowValues[key];
        }
        return '';
    }
    return undefined;
};


AttributeSet.prototype.setShadowValue=function(key,value){
    var oldValue = aura.expressionService.resolve(key, this.values, true);
    if(oldValue instanceof FunctionCallValue){
        this.shadowValues[key]=value;
    }
};

/**
 * Set the attribute of the given name to the given value.
 *
 * @param {String}
 *            key The key can be a path expression inside. E.g.
 *            attribute.nestedValue.value....}
 * @param {Object}
 *            value The value to be set.
 *
 * @protected
 *
 */
AttributeSet.prototype.set = function(key, value, component) {
    var target = this.values;
    if(!$A.clientService.allowAccess(this.attributeDefSet.getDef(key),component)){
        // #if {"modes" : ["DEVELOPMENT"]}
        $A.warning("Access Check Failed! AttributeSet.set(): '"+key+"' of component '"+component+"' is not visible to '"+$A.getContext().getCurrentAccess()+"'.");
        // #end

        // JBUCH: TODO: ACCESS CHECKS: TEMPORARY REPRIEVE
        //return;
    }
    if(!$A.util.isUndefinedOrNull(value) && !this.isValueValidForAttribute(key, value)) {
    	if(this.isTypeOfArray(key)) {
    		value = !$A.util.isArray(value) ? [value] : value;
    	} else {
    		//$A.warning("You set the attribute '" + key + "' to the value '" + value + "' which was the wrong data type for the attribute.");
            // Do we want to allow.
            //return;
    	}
    }

    // Process all keys except last one
    if (key.indexOf('.') >= 0) {
        var path = key.split('.');
        var step = path.shift();
        while (path.length > 0) {
            var nextStep = path.shift();
            var nextTarget = target[step];
            if (nextTarget === undefined) {
                // Attempt to do the right thing: create an empty object or an array
                // depending if the next indice is an object or an array.
                if (isNaN(nextStep)) {
                    target[step] = {};
                } else {
                    target[step] = [];
                }
                target = target[step];
            } else {
                if ($A.util.isExpression(nextTarget)) {
                    target = nextTarget.evaluate();
                } else {
                    target = nextTarget;
                }
            }
            step = nextStep;
        }
        key = step;
    }

    if (target[key] instanceof PropertyReferenceValue && !target[key].isGlobal()) {
        target[key].set(value);
    } else if (!(target[key] instanceof FunctionCallValue)) {
        // HALO: TODO: JBUCH: I DON'T LIKE THIS...
        // Silently do nothing when you try to set on a FunctionCallValue,
        // which we need to support legacy old behaviour due to inheritance.
        target[key] = value;
    }
// #if {"excludeModes" : ["PRODUCTION", "STATS"]}
    else {
        $A.warning("AttributeSet.set(): unable to override the value for '" + key + "=" + target[key] + "'. FunctionCallValues declared in markup are constant.");
    }
// #end
};

/**
 * Clears a property reference value of the given name, and returns it. Does nothing if the attribute
 * does not exist or is not a property reference value.
 *
 * @param {String}
 *            key The key can be a path expression inside. E.g.
 *            attribute.nestedValue.value....}
 *
 * @returns {PropertyReferenceValue} the reference that was found and cleared, or null
 * @protected
 *
 */
AttributeSet.prototype.clearReference = function(key) {
    var oldValue;
    var target=this.values;
    var step=key;

    if (key.indexOf('.') >= 0) {
        var path = key.split('.');
        target = aura.expressionService.resolve(path.slice(0, path.length - 1), target);
        step=path[path.length-1];
    }
    if(target) {
        oldValue = target[step];
        if (oldValue instanceof PropertyReferenceValue) {
            target[step] = undefined;
            return oldValue;
        }
    }
    return null;
};

/**
 * Verifies if a value is valid for the type that the attribute is defined as.
 * Strings as strings, arrays as arrays, etc.
 */
AttributeSet.prototype.isValueValidForAttribute = function(attributeName, value) {
	var attributeDefSet = this.attributeDefSet;
	if(attributeName.indexOf(".")>=0){
		var path = attributeName.split(".");
		attributeName=path[0];
		if(attributeName!="body"&&path.length > 1) {
			// We don't validate setting a value 2 levels deep. (v.prop.subprop)
			return true;
		}
	}

	var attributeDef = attributeDefSet.getDef(attributeName);
	if(!attributeDef) {

		// Attribute doesn't exist on the component
		return false;
	}

	var nativeType = attributeDef.getNativeType();

	// Do not validate property reference values or object types
	if($A.util.isExpression(value) || nativeType === "object") {
		return true;
	}

	// typeof [] == "object", so we need to do this one off for arrays.
	if(nativeType === "array") {
		return $A.util.isArray(value);
	}

	return typeof value === nativeType;
};


AttributeSet.prototype.isTypeOfArray = function(attributeName) {
	if(attributeName.indexOf(".")>=0){
		var path = attributeName.split(".");
		attributeName=path[0];
		if(attributeName!="body"&&path.length > 1) {
			// We don't validate setting a value 2 levels deep. (v.prop.subprop)
			return false;
		}
	}
	var attributeDef = this.attributeDefSet.getDef(attributeName);
	return attributeDef && attributeDef.getNativeType() === "array";
};

/**
 * Reset the attribute set to point at a different def set.
 *
 * Allows us to change the set of attributes in a set when we inject a new
 * component. No checking is done here, if checking is desired, it should be
 * done by the caller.
 *
 * Doesn't check the current state of attributes because they don't matter. This
 * will create/update attributes based on new AttributeDefSet, provided
 * attribute config and current attribute values
 *
 * @param {AttributeDefSet}
 *            attributeDefSet the new def set to install.
 * @param {Object}
 *            attributes - new attributes configuration
 * @private
 */
AttributeSet.prototype.merge = function(attributes, attributeDefSet) {
	if(attributeDefSet){
        $A.assert(attributeDefSet.auraType === "AttributeDefSet", "AttributeSet.merge: A valid AttributeDefSet is required to merge attributes.");
        this.attributeDefSet = attributeDefSet;
    }

	// Reinitialize attribute values
	this.initialize(attributes);
};

/**
 * Gets default attribute value.
 *
 * @param {String}
 *            name - name of attribute
 * @private
 */
AttributeSet.prototype.getDefault = function(name) {
	if (name) {
		var attributeDef = this.attributeDefSet.getDef(name);
		if (attributeDef) {
            return attributeDef.getDefault();
		}
	}
	return null;
};

/**
 * Destroys the attributeset.
 *
 * @param {Boolean}
 *            async - whether to put in our own trashcan
 * @private
 */
AttributeSet.prototype.destroy = function(async) {
    var values = this.values;
    var expressions={};
    for (var k in values) {
        var v = values[k];

        // Body is special because it's a map
        // of bodies for each inheritance level
        // so we need to do a for( var in ) {} loop
        if(k === "body") {
        	for(var globalId in v) {
                var body = v[globalId];
                if(body) {
            		for(var j=0;j<body.length;j++) {
            			body[j].destroy(async);
            		}
                }
        	}
        	continue;
        }

        // KRIS: HALO:
        // HTML Elements store their attributes in the HTMLAttributes map.
        // Since we don't go recursively down the attributes we don't clean these.
        // We should at least destroy them, PRV's still don't release their references.
        // if(k === "HTMLAttributes") {
        //     for(var attribute in v) {
        //         if(v[attribute] && v[attribute].destroy) {
        //             v[attribute].destroy(async);
        //         }
        //     }
        // }

        if(!$A.util.isArray(v)){
            v=[v];
        }

        for(var i=0,value;i<v.length;i++){
            value = v[i];
            if($A.util.isExpression(value)){
                expressions[k]=value;
            } else if ($A.util.isComponent(value)) {
                value.destroy(async);
            }
        }
    }

    this.values = this.attributeDefSet = this.errors = undefined;
    return expressions;
};

/**
 * Loop through AttributeDefSet and create or update value using provided config
 *
 * @param {Object}
 *            config - attribute configuration
 * @private
 */
AttributeSet.prototype.initialize = function(attributes) {
    var attributeDefs = this.attributeDefSet.getValues();
	var attributeNames = this.attributeDefSet.getNames();
	if (!attributeDefs || !attributeNames) {
		return;
	}

	var configValues = attributes || {};

    // Create known attributes and assign values or defaults
	for (var i = 0; i < attributeNames.length; i++) {
		var attributeDef = attributeDefs[attributeNames[i]];
		var name = attributeDef.getDescriptor().getName();
		var hasAttribute = this.hasAttribute(name);
		var hasValue = configValues.hasOwnProperty(name);
		var value = configValues[name];

		if (!hasValue && !hasAttribute) {
			value = this.getDefault(name);
			hasValue = value !== undefined;
		}

        if (attributeDef.isRequired && attributeDef.isRequired()) {
            if (!hasValue) {
//                throw new Error("Missing required attribute " + name);
            }
        }

		if ((hasValue && this.values[name]!==value) || !hasAttribute) {
            if(hasAttribute && value instanceof FunctionCallValue) {
                if (!this.decorators[name]) {
                    this.decorators[name] = [];
                }
                this.decorators[name].push(value);
            }else{
                if (!(value instanceof PropertyReferenceValue && value.equals(this.values[name]))) {
                    this.values[name] = value;
                }
            }
		}
	}

    // Guard against unknown attributes
    var unknownAttributes=[];
    for(var attribute in configValues){
        if(!this.hasAttribute(attribute)){
            unknownAttributes.push(attribute);
        }
    }

    $A.assert(unknownAttributes.length===0,"AttributeSet.initialize: The following unknown attributes could not be initialized: '"+unknownAttributes.join("', '")+"'. Please confirm the spelling and definition of these attributes.");
};

// JBUCH: HALO: TODO: TEMPORARY VALID/ERROR MANAGEMENT - REMOVE WHEN POSSIBLE
AttributeSet.prototype.isValid = function(expression) {
    return this.callOnExpression(AttributeSet.prototype.isValidCallback, Component.prototype.isValid, PassthroughValue.prototype.isValid, expression);
};
AttributeSet.prototype.setValid = function(expression, valid) {
    if (valid) {
        this.clearErrors(expression);
    } else {
        this.addErrors(expression, []);
    }
};
AttributeSet.prototype.clearErrors = function(expression) {
    this.callOnExpression(AttributeSet.prototype.clearErrorsCallback, Component.prototype.clearErrors, PassthroughValue.prototype.clearErrors, expression);
};
AttributeSet.prototype.addErrors = function(expression, errors) {
    this.callOnExpression(AttributeSet.prototype.addErrorsCallback, Component.prototype.addErrors, PassthroughValue.prototype.addErrors, expression, errors);
};
AttributeSet.prototype.getErrors = function(expression) {
    return this.callOnExpression(AttributeSet.prototype.getErrorsCallback, Component.prototype.getErrors, PassthroughValue.prototype.getErrors, expression);
};

AttributeSet.prototype.callOnExpression = function(callback, componentCallback, passthroughCallback, expression, options) {
    var path;
    var value;

    if (expression.indexOf('.') < 0) {
        value = this.values[expression];
    } else {
        path = expression.split('.');
        value = this.values;
        while (!$A.util.isUndefinedOrNull(value) && path.length) {
            var segment = path.shift();
            value = value[segment];

            if (value instanceof PropertyReferenceValue || value instanceof FunctionCallValue || value instanceof ActionReferenceValue) {
                break;
            }
        }
    }

    if (value instanceof PropertyReferenceValue) {
        var valueProvider = value.valueProvider;
        expression = value.expression;
        if (path && path.length) {
            expression += "." + path.join(".");
        }
        while(valueProvider instanceof PassthroughValue && valueProvider.hasExpression(expression)){
            expression = valueProvider.getExpression(expression);
            valueProvider=valueProvider.getComponent();
        }
        if (valueProvider instanceof PassthroughValue) {
            return passthroughCallback.call(valueProvider, expression, options);
        }
        if (valueProvider instanceof Component) {
            return componentCallback.call(valueProvider, expression, options);
        }
        $A.error('Invalid value provider for expression: ' + expression);
    }

    if (value instanceof FunctionCallValue || value instanceof ActionReferenceValue) {
        return true;
    }

    return callback.call(this, expression, options);
};

AttributeSet.prototype.isValidCallback = function(expression) {
    return !this.errors.hasOwnProperty(expression);
};
AttributeSet.prototype.addErrorsCallback = function(expression, errors) {
    if (!this.errors[expression]) {
		this.errors[expression] = [];
	}
	this.errors[expression] = this.errors[expression].concat(errors);
};
AttributeSet.prototype.clearErrorsCallback = function(expression) {
	delete this.errors[expression];
};
AttributeSet.prototype.getErrorsCallback = function(expression) {
	return this.errors[expression] || [];
};
