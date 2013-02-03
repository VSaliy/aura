/*
 * Copyright (C) 2012 salesforce.com, inc.
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
package org.auraframework.impl;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

import org.auraframework.Aura;
import org.auraframework.def.ApplicationDef;
import org.auraframework.def.ComponentDef;
import org.auraframework.def.DefDescriptor;
import org.auraframework.def.DefDescriptor.DefType;
import org.auraframework.def.DescriptorFilter;
import org.auraframework.def.TypeDef;
import org.auraframework.impl.context.AuraRegistryProviderImpl;
import org.auraframework.impl.source.StringSourceLoader;
import org.auraframework.impl.system.DefFactoryImpl;
import org.auraframework.impl.system.DefinitionImpl;
import org.auraframework.instance.BaseComponent;
import org.auraframework.system.AuraContext.Access;
import org.auraframework.system.AuraContext.Format;
import org.auraframework.system.AuraContext.Mode;
import org.auraframework.system.DefRegistry;
import org.auraframework.system.SourceLoader;
import org.auraframework.test.annotation.ThreadHostileTest;
import org.auraframework.throwable.NoAccessException;
import org.auraframework.throwable.quickfix.QuickFixException;
import org.auraframework.util.json.Json;

/**
 * Tests for DefinitionServiceImpl. ThreadHostile due to testGetLastMod
 * ThreadHostile at least since {@link #testFindRegex()} requires exclusive
 * control of the {@link StringSourceLoader}.
 * 
 * @see org.auraframework.impl.registry.RootDefFactoryTest
 */
@ThreadHostileTest
public class DefinitionServiceImplTest extends AuraImplTestCase {
    public DefinitionServiceImplTest(String name) {
        super(name, false);
    }

    @Override
    public void tearDown() throws Exception {
        Aura.getContextService().endContext();
        super.tearDown();
    }

    /**
     * ContextService.assertAccess is called during
     * getDefinition(DefDescriptor).
     */
    public void testGetDefinition_DefDescriptor_assertAccess() throws Exception {
        Aura.getContextService().startContext(Mode.PROD, Format.HTML, Access.PUBLIC);
        DefDescriptor<ComponentDef> desc = addSourceAutoCleanup(ComponentDef.class, "<aura:component></aura:component>");
        try {
            Aura.getDefinitionService().getDefinition(desc);
            fail("Expected NoAccessException from assertAccess");
        } catch (NoAccessException e) {
        }
    }

    /**
     * ContextService.assertAccess is called during getDefinition(String,
     * Class).
     */
    public void testGetDefinition_StringClass_assertAccess() throws Exception {
        Aura.getContextService().startContext(Mode.PROD, Format.HTML, Access.PUBLIC);
        DefDescriptor<ComponentDef> desc = addSourceAutoCleanup(ComponentDef.class, "<aura:component></aura:component>");
        try {
            Aura.getDefinitionService().getDefinition(desc.getName(), ComponentDef.class);
            fail("Expected NoAccessException from assertAccess");
        } catch (NoAccessException e) {
        }
    }

    /**
     * ContextService.assertAccess is called during getDefinition(String,
     * DefType...).
     */
    public void testGetDefinition_StringDefType_assertAccess() throws Exception {
        Aura.getContextService().startContext(Mode.PROD, Format.HTML, Access.PUBLIC);
        DefDescriptor<ComponentDef> desc = addSourceAutoCleanup(ComponentDef.class, "<aura:component></aura:component>");
        try {
            Aura.getDefinitionService().getDefinition(desc.getName(), DefType.COMPONENT);
            fail("Expected NoAccessException from assertAccess");
        } catch (NoAccessException e) {
        }
    }

    /**
     * ContextService.assertAccess is called during save(Definition).
     */
    public void testSave_assertAccess() throws Exception {
        Aura.getContextService().startContext(Mode.DEV, Format.HTML, Access.PUBLIC);
        ComponentDef def = addSourceAutoCleanup(ComponentDef.class, "<aura:component></aura:component>").getDef();
        Aura.getContextService().endContext();
        Aura.getContextService().startContext(Mode.PROD, Format.HTML, Access.PUBLIC);
        try {
            Aura.getDefinitionService().save(def);
            fail("Expected NoAccessException from assertAccess");
        } catch (NoAccessException e) {
        }
    }

    /**
     * Test find(String) using regex's and look in different DefRegistry's for
     * results.
     */
    public void testFindRegex() throws Exception {
        Aura.getContextService().startContext(Mode.DEV, Format.HTML, Access.PUBLIC);

        String baseContents = "<aura:application></aura:application>";

        String nonce = auraTestingUtil.getNonce();
        DefDescriptor<ApplicationDef> houseboat = addSourceAutoCleanup(ApplicationDef.class, baseContents,
                String.format("house%sboat", nonce));
        addSourceAutoCleanup(ApplicationDef.class, baseContents, String.format("house%sparty", nonce));
        addSourceAutoCleanup(ApplicationDef.class, baseContents, String.format("pants%sparty", nonce));

        // Test wildcards
        assertEquals("find() fails with wildcard as prefix", 1,
                definitionService.find(new DescriptorFilter("*://" + houseboat.getDescriptorName())).size());
        assertEquals("find() fails with wildcard as namespace", 1,
                definitionService.find(new DescriptorFilter("markup://*:" + houseboat.getName())).size());
        assertEquals("find() fails with wildcard as name", 1,
                definitionService.find(new DescriptorFilter(houseboat.getQualifiedName())).size());
        assertEquals("find() fails with wildcard at end of name", 2,
                definitionService.find(new DescriptorFilter(String.format("markup://string:house%s*", nonce))).size());
        assertEquals("find() fails with wildcard at beginning of name", 2,
                definitionService.find(new DescriptorFilter(String.format("markup://string:*%sparty*", nonce))).size());
        assertEquals("find() should not find nonexistent name with preceeding wildcard", 0,
                definitionService.find(new DescriptorFilter("markup://string:*notherecaptain")).size());

        // Look in NonCachingDefRegistry
        assertEquals("find() should find a single component", 1,
                definitionService.find(new DescriptorFilter("markup://ui:outputNumber")).size());
        assertEquals("find() fails with wildcard as prefix", 3,
                definitionService.find(new DescriptorFilter("*://ui:outputNumber")).size());
        assertEquals("find() is finding non-existent items", 0,
                definitionService.find(new DescriptorFilter("markup://ui:doesntexist")).size());

        // Look in AuraStaticTypeDefRegistry (StaticDefRegistry)
        assertEquals("find() fails looking in StaticDefRegistry", 1,
                definitionService.find(new DescriptorFilter("aura://*:String")).size());
        // Look in AuraStaticControllerDefRegistry (StaticDefRegistry)
        assertEquals("find() fails looking in StaticDefRegistry", 1,
                definitionService.find(new DescriptorFilter("aura://*:ComponentController")).size());
        assertEquals("find() is finding non-existent items", 0,
                definitionService.find(new DescriptorFilter("aura://*:doesntexist")).size());

        // Find css
        // This always returns 0 results - W-1426841
        // assertEquals("find() fails with wildcard as prefix", 1,
        // definitionService.find("css://test.themeTest").size());
    }

    public static class AuraTestRegistryProviderWithNulls extends AuraRegistryProviderImpl {

        @Override
        public DefRegistry<?>[] getRegistries(Mode mode, Access access, Set<SourceLoader> extraLoaders) {
            return new DefRegistry<?>[] { createDefRegistry(new TestTypeDefFactory(), DefType.TYPE, "test") };
        }

        public static class TestTypeDefFactory extends DefFactoryImpl<TypeDef> {

            @Override
            public TypeDef getDef(DefDescriptor<TypeDef> descriptor) throws QuickFixException {
                return new TestTypeDef(descriptor, null);
            }

            @Override
            public Set<DefDescriptor<TypeDef>> find(DefDescriptor<TypeDef> matcher) {
                Set<DefDescriptor<TypeDef>> ret = new HashSet<DefDescriptor<TypeDef>>();
                ret.add(Aura.getDefinitionService().getDefDescriptor("test://foo.bar1", TypeDef.class));
                ret.add(Aura.getDefinitionService().getDefDescriptor("test://foo.bar2", TypeDef.class));
                ret.add(Aura.getDefinitionService().getDefDescriptor("test://foo.bar3", TypeDef.class));
                return ret;
            }
        }

        public static class TestTypeDef extends DefinitionImpl<TypeDef> implements TypeDef {
            private static final long serialVersionUID = 1L;

            public TestTypeDef(DefDescriptor<TypeDef> descriptor, Object object) {
                super(descriptor, null);
            }

            @Override
            public void serialize(Json json) throws IOException {
            }

            @Override
            public Object valueOf(Object stringRep) {
                return null;
            }

            @Override
            public Object wrap(Object o) {
                return null;
            }

            @Override
            public Object getExternalType(String prefix) throws QuickFixException {
                return null;
            }

            @Override
            public Object initialize(Object config, BaseComponent<?, ?> valueProvider) throws QuickFixException {
                return null;
            }

            @Override
            public void appendDependencies(Object instance, Set<DefDescriptor<?>> deps) throws QuickFixException {
            }

            @Override
            public void appendDependencies(Set<DefDescriptor<?>> dependencies) throws QuickFixException {
                dependencies.add(Aura.getDefinitionService().getDefDescriptor("test://foo.barA", TypeDef.class));
                dependencies.add(Aura.getDefinitionService().getDefDescriptor("test://foo.barB", TypeDef.class));
                dependencies.add(Aura.getDefinitionService().getDefDescriptor("test://foo.barC", TypeDef.class));
            }
        }

    }
}
