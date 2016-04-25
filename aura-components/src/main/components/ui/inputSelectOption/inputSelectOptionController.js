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
({
    updateSelectedState : function (cmp) {
        // in safari selected attr behave different, it's not enough to change the value in the DOM element,
        // we have to do it this way also to be reflected in the UI
        if (cmp.get('v.value') && cmp.getElement()) {
            cmp.getElement().selected = true;
        }
    }
}) // eslint-disable-line semi