/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GitHubRepoRef,
    InMemoryProject,
} from "@atomist/automation-client";
import * as assert from "power-assert";
import { executePushReactions } from "../../../lib/api-helper/listener/executePushReactions";
import { fakeGoalInvocation } from "../../../lib/api-helper/test/fakeGoalInvocation";
import { SingleProjectLoader } from "../../../lib/api-helper/test/SingleProjectLoader";
import { PushListenerInvocation } from "../../../lib/api/listener/PushListener";
import { PushImpactListenerRegistration, PushReactionResponse } from "../../../lib/api/registration/PushImpactListenerRegistration";
import { TruePushTest } from "../../api/mapping/support/pushTestUtils.test";

function react(invocations: PushListenerInvocation[], stopTheWorld: boolean): PushImpactListenerRegistration {
    return {
        name: "hatred",
        pushTest: TruePushTest,
        action: async cri => {
            invocations.push(cri);
            if (stopTheWorld) {
                return PushReactionResponse.failGoals;
            }
        },
    };
}

describe("executePushReactions", () => {

    it("stops the world", async () => {
        const id = new GitHubRepoRef("a", "b");
        const p = InMemoryProject.from(id);
        const invocations: PushListenerInvocation[] = [];
        const ge = executePushReactions([react(invocations, true)]);
        const r = await ge(fakeGoalInvocation(id, {
            projectLoader: new SingleProjectLoader(p),
        } as any));
        assert.equal(invocations.length, 1);
        assert(!r.requireApproval);
        assert.equal(r.code, 1);
    });

    it("is invoked but doesn't stop the world", async () => {
        const id = new GitHubRepoRef("a", "b");
        const p = InMemoryProject.from(id);
        const invocations: PushListenerInvocation[] = [];
        const ge = executePushReactions([react(invocations, false)]);
        const r = await ge(fakeGoalInvocation(id, {
            projectLoader: new SingleProjectLoader(p),
        } as any));
        assert.equal(invocations.length, 1);
        assert.equal(r.code, 0);
        assert(!r.requireApproval);
        assert.equal(r.code, 0);
    });

});
