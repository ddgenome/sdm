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

import { Maker } from "@atomist/automation-client";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import { HandleEvent } from "@atomist/automation-client/lib/HandleEvent";

/**
 * Unit of functionality that can be added to an Atomist automation.
 */
export interface FunctionalUnit {

    readonly eventHandlers: Array<Maker<HandleEvent<any>>>;

    readonly commandHandlers: Array<Maker<HandleCommand>>;

    readonly ingesters: string[];
}
