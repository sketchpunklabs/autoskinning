# AutoSkinning

[![twitter](https://img.shields.io/badge/Twitter-profile-blue?style=flat-square&logo=twitter)](https://twitter.com/SketchpunkLabs)
[![mastodon](https://img.shields.io/badge/Mastodon-profile-blue?style=flat-square&logo=mastodon)](https://mastodon.gamedev.place/@sketchpunk)
[![bluesky](https://img.shields.io/badge/Bluesky-profile-blue?style=flat-square&logo=threads)](https://bsky.app/profile/sketchpunk.bsky.social)
[![bluesky](https://img.shields.io/badge/Threads-profile-blue?style=flat-square&logo=threads)](https://www.threads.net/@sketchpunklabs)


[![youtube](https://img.shields.io/badge/Youtube-subscribe-red?style=flat-square&logo=youtube)](https://youtube.com/c/sketchpunklabs)
[![github](https://img.shields.io/badge/Sponsor-donate-red?style=flat-square&logo=github)](https://github.com/sponsors/sketchpunklabs)
[![Patreon](https://img.shields.io/badge/Patreon-donate-red?style=flat-square&logo=youtube)](https://www.patreon.com/sketchpunk)

<br>
Live Demo: https://sketchpunklabs.github.io/autoskinning/

### TL;DR ###
This repo contains various prototypes to autoskin 3D models using web technologies.
It does so by using compute shaders to offline all the heavy number crunching to the GPU.


Technologies Used
- Raw WebGL
- ThreeJS for Rendering
- GPGPU - Compute shaders that saves to DataTextures
- TransformFeedback - Compute shaders that saves to GL Attribute Buffers

#### Note ####
This library uses a modified version of the ThreeJS as it does not have support
to use WebGL's Transformfeedback. This will not work using vanilla Threejs.

### Development Setup ###
```
git clone --depth=1 https://github.com/sketchpunklabs/autoskinning
cd autoskinning
npm install
npm run dev
```