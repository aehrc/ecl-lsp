import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.2.0"
    id("org.jetbrains.intellij.platform")
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

val junitJupiterVersion = "6.0.3"
val opentest4jVersion = "1.3.0"
val junitLegacyVersion = "4.13.2"

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaUltimate(providers.gradleProperty("platformVersion").get())
        bundledPlugin("org.jetbrains.plugins.textmate")
        testFramework(TestFrameworkType.Platform)
        pluginVerifier()
        zipSigner()
    }

    testImplementation("org.junit.jupiter:junit-jupiter:$junitJupiterVersion")
    testImplementation("org.opentest4j:opentest4j:$opentest4jVersion")
    testImplementation("junit:junit:$junitLegacyVersion")  // Required by IntelliJ platform test framework (BasePlatformTestCase extends TestCase)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}

intellijPlatform {
    pluginConfiguration {
        name = providers.gradleProperty("pluginName")
        version = providers.gradleProperty("pluginVersion")

        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = providers.gradleProperty("pluginUntilBuild")
        }
    }
}

// Copy shared TextMate grammar into plugin directory (not JAR resources).
// The EclTextMateBundleProvider resolves the bundle via the plugin install path,
// which requires files on the real filesystem (not inside a JAR).
val pluginSandboxDir = layout.buildDirectory.dir(
    "idea-sandbox/${providers.gradleProperty("platformType").get()}-${providers.gradleProperty("platformVersion").get()}/plugins/${project.name}"
)

val copyTextMateToSandbox by tasks.registering(Copy::class) {
    dependsOn("prepareSandbox")
    // package.json at bundle root
    from("../../shared/syntaxes/package.json")
    into(pluginSandboxDir.map { it.dir("textmate/ecl") })
}

val copyTextMateGrammarToSandbox by tasks.registering(Copy::class) {
    dependsOn("prepareSandbox")
    // Grammar file under syntaxes/ (matches package.json path)
    from("../../shared/syntaxes/ecl.tmLanguage.json")
    into(pluginSandboxDir.map { it.dir("textmate/ecl/syntaxes") })
}

// ── Bundle ecl-lsp-server into plugin distribution ──────────────────────
// Assembles a self-contained Node.js server directory inside the plugin ZIP
// so the server can be found without a global npm install.

val rootDir = rootProject.projectDir
val serverPkg = rootDir.resolve("../../packages/ecl-lsp-server")
val corePkg = rootDir.resolve("../../packages/ecl-core")
val nodeModules = rootDir.resolve("../../node_modules")

val bundleServerDir = layout.buildDirectory.dir("ecl-lsp-server")

val bundleServer by tasks.registering(Sync::class) {
    into(bundleServerDir)

    // Project license + third-party notices
    from(rootDir.resolve("../../LICENSE"))
    from(rootDir.resolve("../../THIRD-PARTY-LICENSES.txt"))

    // Server dist (compiled JS)
    from(serverPkg.resolve("dist")) {
        into("dist")
        exclude("test/**")
        exclude("**/*.map")
    }
    // Server entry point
    from(serverPkg.resolve("bin")) { into("bin") }
    from(serverPkg.resolve("package.json"))

    // ecl-core (resolved — not a symlink)
    from(corePkg.resolve("dist")) {
        into("node_modules/ecl-core/dist")
        exclude("test/**")
        exclude("**/*.map")
    }
    from(corePkg.resolve("package.json")) { into("node_modules/ecl-core") }

    // LSP protocol dependencies
    from(nodeModules.resolve("vscode-languageserver")) { into("node_modules/vscode-languageserver") }
    from(nodeModules.resolve("vscode-languageserver-textdocument")) { into("node_modules/vscode-languageserver-textdocument") }
    from(nodeModules.resolve("vscode-languageserver-protocol")) { into("node_modules/vscode-languageserver-protocol") }
    from(nodeModules.resolve("vscode-languageserver-types")) { into("node_modules/vscode-languageserver-types") }
    from(nodeModules.resolve("vscode-jsonrpc")) { into("node_modules/vscode-jsonrpc") }

    // ecl-core runtime dependencies
    from(nodeModules.resolve("antlr4ts")) { into("node_modules/antlr4ts") }

    // FHIR integration (node-fetch + transitive deps)
    from(nodeModules.resolve("node-fetch")) { into("node_modules/node-fetch") }
    from(nodeModules.resolve("whatwg-url")) { into("node_modules/whatwg-url") }
    from(nodeModules.resolve("tr46")) { into("node_modules/tr46") }
    from(nodeModules.resolve("webidl-conversions")) { into("node_modules/webidl-conversions") }
}

val copyServerToSandbox by tasks.registering(Copy::class) {
    dependsOn(bundleServer, "prepareSandbox")
    from(bundleServerDir)
    into(layout.buildDirectory.dir("idea-sandbox/${providers.gradleProperty("platformType").get()}-${providers.gradleProperty("platformVersion").get()}/plugins/${project.name}/ecl-lsp-server"))
}

tasks.named("buildSearchableOptions") { dependsOn(copyServerToSandbox, copyTextMateToSandbox, copyTextMateGrammarToSandbox) }
tasks.named("buildPlugin") { dependsOn(copyServerToSandbox, copyTextMateToSandbox, copyTextMateGrammarToSandbox) }
tasks.named("runIde") { dependsOn(copyServerToSandbox, copyTextMateToSandbox, copyTextMateGrammarToSandbox) }

// ── Test sandbox: mirror server + grammar into test sandbox ──────────────
val testSandboxDir = layout.buildDirectory.dir(
    "idea-sandbox/${providers.gradleProperty("platformType").get()}-${providers.gradleProperty("platformVersion").get()}-test/plugins/${project.name}"
)

val copyServerToTestSandbox by tasks.registering(Copy::class) {
    dependsOn(bundleServer, "prepareTestSandbox")
    from(bundleServerDir)
    into(testSandboxDir.map { it.dir("ecl-lsp-server") })
}

val copyTextMateToTestSandbox by tasks.registering(Copy::class) {
    dependsOn("prepareTestSandbox")
    from("../../shared/syntaxes/package.json")
    into(testSandboxDir.map { it.dir("textmate/ecl") })
}

val copyTextMateGrammarToTestSandbox by tasks.registering(Copy::class) {
    dependsOn("prepareTestSandbox")
    from("../../shared/syntaxes/ecl.tmLanguage.json")
    into(testSandboxDir.map { it.dir("textmate/ecl/syntaxes") })
}

tasks.named("prepareTestSandbox") {
    finalizedBy(copyServerToTestSandbox, copyTextMateToTestSandbox, copyTextMateGrammarToTestSandbox)
}
