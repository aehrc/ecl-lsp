// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse.test;

import static org.junit.Assert.*;
import static org.junit.Assume.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.lsp4e.LanguageServerWrapper;
import org.eclipse.lsp4e.LanguageServiceAccessor;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.ide.IDE;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Integration tests that open .ecl files in the Eclipse editor and verify
 * that the LSP server starts and produces diagnostics.
 *
 * <p>These tests require a UI harness ({@code useUIHarness=true}) and
 * an available Node.js runtime with the bundled server.
 * On Linux CI, run under Xvfb: {@code xvfb-run mvn verify}.
 *
 * <p>Enable with {@code -Decl.test.integration=true} to skip on environments
 * where the server is not available.
 */
public class EclLspIntegrationTest {

    private static final String PROJECT_NAME = "ecl-test-project";
    private static final String INVALID_ECL = "< AND <\n";
    private static final int POLL_INTERVAL_MS = 500;
    private static final int TIMEOUT_MS = 30_000;

    private static IProject project;

    @BeforeClass
    public static void setUp() throws CoreException {
        // Skip unless integration tests are explicitly enabled
        assumeTrue("Integration tests disabled (set -Decl.test.integration=true)",
                "true".equals(System.getProperty("ecl.test.integration")));

        // Create a temporary project in the workspace
        project = ResourcesPlugin.getWorkspace().getRoot().getProject(PROJECT_NAME);
        if (!project.exists()) {
            IProjectDescription desc = ResourcesPlugin.getWorkspace()
                    .newProjectDescription(PROJECT_NAME);
            project.create(desc, new NullProgressMonitor());
        }
        if (!project.isOpen()) {
            project.open(new NullProgressMonitor());
        }
    }

    @AfterClass
    public static void tearDown() throws CoreException {
        if (project != null && project.exists()) {
            project.delete(true, true, new NullProgressMonitor());
        }
    }

    @Test
    public void diagnosticsAppearForInvalidEcl() throws Exception {
        IFile file = createFile("invalid.ecl", INVALID_ECL);

        // Open the file in an editor to trigger LSP
        IWorkbenchPage page = PlatformUI.getWorkbench()
                .getActiveWorkbenchWindow().getActivePage();
        IDE.openEditor(page, file);

        // Poll for markers (diagnostics)
        boolean found = waitForMarkers(file, TIMEOUT_MS);
        assertTrue("Expected diagnostic markers for invalid ECL within timeout", found);

        IMarker[] markers = file.findMarkers(IMarker.PROBLEM, true, 0);
        assertTrue("Should have at least one problem marker", markers.length > 0);
    }

    @Test
    public void noDiagnosticsForValidEcl() throws Exception {
        IFile file = createFile("valid.ecl", "< 404684003 |Clinical finding|\n");

        IWorkbenchPage page = PlatformUI.getWorkbench()
                .getActiveWorkbenchWindow().getActivePage();
        IDE.openEditor(page, file);

        // Wait a bit for the server to process, then check
        Thread.sleep(5_000);

        IMarker[] markers = file.findMarkers(IMarker.PROBLEM, true, 0);
        int errors = 0;
        for (IMarker m : markers) {
            if (m.getAttribute(IMarker.SEVERITY, -1) == IMarker.SEVERITY_ERROR) {
                errors++;
            }
        }
        assertEquals("Valid ECL should produce no error markers", 0, errors);
    }

    private IFile createFile(String name, String content) throws CoreException {
        IFile file = project.getFile(name);
        ByteArrayInputStream source = new ByteArrayInputStream(
                content.getBytes(StandardCharsets.UTF_8));
        if (file.exists()) {
            file.setContents(source, true, false, new NullProgressMonitor());
        } else {
            file.create(source, true, new NullProgressMonitor());
        }
        return file;
    }

    @Test
    public void hoverProviderAvailableForEclFiles() throws Exception {
        // First ensure the LSP server is running by waiting for diagnostics
        IFile probeFile = createFile("hover-probe.ecl", INVALID_ECL);
        IWorkbenchPage page = PlatformUI.getWorkbench()
                .getActiveWorkbenchWindow().getActivePage();
        IDE.openEditor(page, probeFile);
        assertTrue("LSP server should be running (diagnostics appeared)",
                waitForMarkers(probeFile, TIMEOUT_MS));

        // Open a valid file and verify hover capability is available
        IFile file = createFile("hover.ecl", "< 404684003 |Clinical finding|\n");
        IDE.openEditor(page, file);

        // Poll for an LSP server wrapper with hover capability
        boolean hoverAvailable = waitForLspCapability(file,
                cap -> cap.getHoverProvider() != null, TIMEOUT_MS);
        assertTrue("LSP server should provide hover for .ecl files", hoverAvailable);
    }

    @Test
    public void completionProviderAvailableForEclFiles() throws Exception {
        // Ensure the LSP server is running
        IFile probeFile = createFile("completion-probe.ecl", INVALID_ECL);
        IWorkbenchPage page = PlatformUI.getWorkbench()
                .getActiveWorkbenchWindow().getActivePage();
        IDE.openEditor(page, probeFile);
        assertTrue("LSP server should be running (diagnostics appeared)",
                waitForMarkers(probeFile, TIMEOUT_MS));

        // Open a file and verify completion capability is available
        IFile file = createFile("complete.ecl", "< \n");
        IDE.openEditor(page, file);

        // Poll for an LSP server wrapper with completion capability
        boolean completionAvailable = waitForLspCapability(file,
                cap -> cap.getCompletionProvider() != null, TIMEOUT_MS);
        assertTrue("LSP server should provide completion for .ecl files", completionAvailable);
    }

    private boolean waitForMarkers(IFile file, int timeoutMs) throws Exception {
        long start = System.currentTimeMillis();
        while (System.currentTimeMillis() - start < timeoutMs) {
            IMarker[] markers = file.findMarkers(IMarker.PROBLEM, true, 0);
            if (markers.length > 0) {
                return true;
            }
            Thread.sleep(POLL_INTERVAL_MS);
        }
        return false;
    }

    /**
     * Polls until an LSP server with the given capability is active for the file.
     */
    @SuppressWarnings("unchecked")
    private boolean waitForLspCapability(IFile file,
            java.util.function.Predicate<org.eclipse.lsp4j.ServerCapabilities> predicate,
            int timeoutMs) throws Exception {
        long start = System.currentTimeMillis();
        while (System.currentTimeMillis() - start < timeoutMs) {
            try {
                Collection<LanguageServerWrapper> wrappers =
                        LanguageServiceAccessor.getLSWrappers(file, predicate);
                for (LanguageServerWrapper wrapper : wrappers) {
                    if (wrapper.isActive()) {
                        return true;
                    }
                }
            } catch (Exception _) {
                // Server not yet ready — retry
            }
            Thread.sleep(POLL_INTERVAL_MS);
        }
        return false;
    }
}
