// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/DaimoEphemeralNotes.sol";

contract DeployEphemeralNotesScript is Script {
    function run(IERC20 token) public {
        vm.startBroadcast();
        new EphemeralNotes(token);
        vm.stopBroadcast();
    }

    // Exclude from forge coverage
    function test() public {}
}
