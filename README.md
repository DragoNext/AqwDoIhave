<p align="center">
  <img src="https://user-images.githubusercontent.com/49029552/201134795-1fb59aad-2f6d-4e22-8364-516c230cde48.png">
</p>

Table of contents
=================

<!--ts-->
   * [About](#about)
   * [Releases](#releases)
   * [Installation](#installation)
   * [Usage](#usage)
   * [Features](#features)
   * [Issues](#issues)
   * [Images](#images)
<!--te-->


## About
AqwDoIHave is a Chromium extension for AQW Wiki and account/inventory tracking.

This is the final feature-complete version of the project.


## Releases
Recommended download method: use Releases instead of manually grabbing random repo files.

Planned release variants:

- `AqwDoIHave-Full`
  Includes `Extension/data/embeddings`.
  Use this if you want Cosmetic Search / similarity search.

- `AqwDoIHave-No-Embeddings`
  Does not include `Extension/data/embeddings`.
  Use this if you want the lighter package size and do not care about Cosmetic Search.

Notes:

- The full release is much larger because embeddings are bundled.
- The no-embeddings release is smaller, but Cosmetic Search will not be available there.


## Installation
<details><summary>Standard Browser Installation</summary>
  <pre><li>Download the release you want.</li><li>Extract it somewhere on disk.</li><li>Open your browser extensions page: <code>chrome://extensions</code>, <code>brave://extensions</code>, etc.</li><li>Enable <code>Developer mode</code>.</li><li>Click <code>Load unpacked</code>.</li><li>Select the <code>Extension</code> folder.</li></pre>
</details>

<details><summary>Artix Game Launcher Integration</summary>
Discontinued due to needing constant updates whenever the launcher changed.
</details>


## Usage
- Go to `https://account.aq.com/AQW/Inventory`, log in if needed, open Inventory, and let it load fully.
- Go to any AQW Wiki page under `http://aqwwiki.wikidot.com/`.
- The extension will highlight items you own and show extra account/item info.
- To refresh account data, click `Update Inventory` and wait a few seconds.


## Features
On AQW Wiki:

- Dark mode for supported wiki pages.
- Highlighting owned items.  
  <img src="https://user-images.githubusercontent.com/49029552/201154840-3335a319-f75c-4df4-9df9-2d9c197af7f7.png">
- Displaying resource item counts.  
  <img src="https://user-images.githubusercontent.com/49029552/201155338-df38dc37-ed5b-4df7-8f9c-b46ff13c2880.png">
- Showing whether an item is in inventory or bank.  
  <img src="https://user-images.githubusercontent.com/49029552/201156221-5c5ea680-7e30-4c8e-aa84-c54c40c2d9aa.png">
- Showing where items come from in list pages like `/armors`, with clickable source links:
  <pre><li>Monster Drop <img height=16 src="https://user-images.githubusercontent.com/49029552/201157446-9db442cc-bcc9-498c-9c4e-01632b9345c6.png">
  <li>Collection Chest <img height=16 src="https://user-images.githubusercontent.com/49029552/201368034-c9de9985-2f39-43b4-acff-cecec23e84c7.png">
  <li>Wheel of Fortune <img height=16 src="https://user-images.githubusercontent.com/49029552/201368161-cb58f5ff-955b-4583-ad5b-36c95e0b0742.png">
  <li>Shop <img height=16 src="https://user-images.githubusercontent.com/49029552/201368364-c58c29aa-76a1-4619-b5b2-852472e45f76.png">
  <li>Merge Shop <img height=16 src="https://user-images.githubusercontent.com/49029552/201368105-82598ec8-7b8a-4cd2-9eb9-58e8ffaf0d77.png">
  <li>Quest <img height=16 src="https://user-images.githubusercontent.com/49029552/201368293-ad081605-402e-4e0f-8e26-5e9e9ef2a198.png">
  <li>Treasure Chest <img height=16 src="https://user-images.githubusercontent.com/49029552/201368322-9eb3666a-e9bb-4133-8ffa-7a8898b6e672.png">
  </pre>

On AqwDoIHave Extras:

- `To Drop`
- `To Merge`
- `To Quest`
- `In Bank`
- `Completed`
- `Cosmetic Search`

Cosmetic Search:

- Uses bundled embeddings in the full release.
- Lets you open similar cosmetics from supported item cards.
- Supports type filters and ownership filters.


## Issues
[Create issue](https://github.com/DragoNext/AqwDoIhave/issues).


## Images
![image](https://user-images.githubusercontent.com/49029552/201159350-17894958-e2f8-4369-b1b6-0aec0d48972a.png)
![image](https://user-images.githubusercontent.com/49029552/201159676-3b49ce63-eede-4414-874a-12774f461bb8.png)
![image](https://user-images.githubusercontent.com/49029552/201159885-e49e75ef-3616-4f12-8b26-7e5188bb4a63.png)
