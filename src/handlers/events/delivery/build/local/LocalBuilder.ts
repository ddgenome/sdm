import {HandlerResult, logger, Success} from "@atomist/automation-client";
import {
    ProjectOperationCredentials,
    TokenCredentials,
} from "@atomist/automation-client/operations/common/ProjectOperationCredentials";
import {RemoteRepoRef} from "@atomist/automation-client/operations/common/RepoId";
import axios from "axios";
import {AddressChannels} from "../../../../../common/slack/addressChannels";
import {InterpretedLog, LogInterpreter} from "../../../../../spi/log/InterpretedLog";
import {
    LogFactory, ProgressLog,
    QueryableProgressLog,
} from "../../../../../spi/log/ProgressLog";
import {reportFailureInterpretation} from "../../../../../util/slack/reportFailureInterpretation";
import {postLinkImageWebhook} from "../../../../../util/webhook/ImageLink";
import {ArtifactStore} from "../../ArtifactStore";
import {AppInfo} from "../../deploy/Deployment";
import {Builder, PushThatTriggersBuild} from "../Builder";

export interface LocalBuildInProgress {

    readonly buildResult: Promise<{ error: boolean, code: number }>;

    readonly repoRef: RemoteRepoRef;

    readonly team: string;

    /** Available once build is complete */
    readonly appInfo: AppInfo;

    readonly deploymentUnitFile: string;

    readonly url: string;
}

/**
 * Superclass for build implemented on the automation client itself, emitting appropriate events to Atomist.
 * Allows listening to a Running build
 */
export abstract class LocalBuilder implements Builder {

    constructor(private artifactStore: ArtifactStore,
                private logFactory: LogFactory) {
    }

    public async initiateBuild(creds: ProjectOperationCredentials,
                               id: RemoteRepoRef,
                               addressChannels: AddressChannels,
                               team: string, push: PushThatTriggersBuild): Promise<HandlerResult> {
        const as = this.artifactStore;
        const token = (creds as TokenCredentials).token;
        const log = await this.logFactory();
        const logInterpreter = this.logInterpreter;

        const rb = await this.startBuild(creds, id, team, log);
        const buildComplete: Promise<HandlerResult> = rb.buildResult.then(br => {
            if (!br.error) {
                return onExit(
                    token,
                    true,
                    rb, team, push.branch, as,
                    log,
                    addressChannels, logInterpreter)
                    .then(() => Success);
            } else {
                return onExit(
                    token,
                    false,
                    rb, team, push.branch, as,
                    log,
                    addressChannels, logInterpreter)
                    .then(() => ({code: 1}));
            }
        });
        await onStarted(rb, push.branch);
        return buildComplete;
    }

    public abstract logInterpreter(log: string): InterpretedLog | undefined;

    protected abstract startBuild(creds: ProjectOperationCredentials, id: RemoteRepoRef,
                                  team: string, log: ProgressLog): Promise<LocalBuildInProgress>;
}

function onStarted(runningBuild: LocalBuildInProgress, branch: string) {
    return updateAtomistLifecycle(runningBuild, "STARTED", "STARTED", branch);
}

export const NotARealUrl = "https://not.a.real.url";

function updateAtomistLifecycle(runningBuild: LocalBuildInProgress,
                                status: "STARTED" | "SUCCESS" | "FAILURE",
                                phase: "STARTED" | "FINALIZED" = "FINALIZED", branch: string): Promise<LocalBuildInProgress> {
    // TODO Use David's Abstraction?
    const buildUrl = runningBuild.url || NotARealUrl; // required in build
    logger.info(`Telling Atomist about a ${status} build on ${branch}, sha ${runningBuild.repoRef.sha}, url ${buildUrl}`);
    const url = `https://webhook.atomist.com/atomist/jenkins/teams/${runningBuild.team}`;
    const data = {
        name: `Build ${runningBuild.repoRef.sha}`,
        duration: 3,
        build: {
            number: `Build ${runningBuild.repoRef.sha.substring(0, 7)}...`,
            scm: {
                commit: runningBuild.repoRef.sha,
                url: `https://github.com/${runningBuild.repoRef.owner}/${runningBuild.repoRef.repo}`,
                branch,
            },
            phase,
            status,
            full_url: buildUrl,
        },
    };
    return axios.post(url, data)
        .then(() => runningBuild);
}

async function onExit(token: string,
                      success: boolean,
                      rb: LocalBuildInProgress,
                      team: string,
                      branch: string,
                      artifactStore: ArtifactStore,
                      log: QueryableProgressLog,
                      ac: AddressChannels,
                      logInterpreter: LogInterpreter): Promise<any> {
    try {
        if (success) {
            await updateAtomistLifecycle(rb, "SUCCESS", "FINALIZED", branch);
            if (!!rb.deploymentUnitFile) {
                await linkArtifact(token, rb, team, artifactStore);
            } else {
                logger.warn("No artifact generated by build of %j", rb.appInfo);
            }
        } else {
            await updateAtomistLifecycle(rb, "FAILURE", "FINALIZED", branch);
            const interpretation = logInterpreter && logInterpreter(log.log);
            // The deployer might have information about the failure; report it in the channels
            if (interpretation) {
                await reportFailureInterpretation("build", interpretation, log, rb.appInfo.id, ac);
            }
        }
    } finally {
        await log.close();
    }
}

function linkArtifact(token: string, rb: LocalBuildInProgress, team: string, artifactStore: ArtifactStore): Promise<any> {
    return artifactStore.storeFile(rb.appInfo, rb.deploymentUnitFile, {token})
        .then(imageUrl => postLinkImageWebhook(rb.repoRef.owner, rb.repoRef.repo, rb.repoRef.sha, imageUrl, team));
}
