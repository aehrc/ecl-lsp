// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse;

import org.eclipse.ui.plugin.AbstractUIPlugin;
import org.osgi.framework.BundleContext;

/**
 * Plugin activator for the ECL Language Support plugin.
 *
 * <p>This class follows the standard Eclipse plugin activator pattern, where the OSGi framework
 * manages the singleton lifecycle via {@link #start(BundleContext)} and {@link #stop(BundleContext)}.
 * The static {@code plugin} field is required by Eclipse convention so that other classes in the
 * bundle can access plugin-scoped resources (preferences, log, etc.) via {@link #getDefault()}.
 * This is not a general-purpose Singleton -- it is the prescribed Eclipse/OSGi activator pattern.
 */
@SuppressWarnings("java:S6548") // Eclipse activator pattern requires a managed singleton instance
public class EclPlugin extends AbstractUIPlugin {

    public static final String PLUGIN_ID = "au.csiro.ecl.eclipse";

    private static EclPlugin plugin;

    @Override
    public void start(BundleContext context) throws Exception {
        super.start(context);
        setDefault(this);
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        setDefault(null);
        super.stop(context);
    }

    private static void setDefault(EclPlugin instance) {
        plugin = instance;
    }

    public static EclPlugin getDefault() {
        return plugin;
    }
}
