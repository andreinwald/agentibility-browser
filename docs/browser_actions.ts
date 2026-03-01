
// await browser.startScreencast((frame) => {
//     // frame.data is base64-encoded image
//     // frame.metadata contains viewport info
//     console.log('Frame received:', frame.metadata.deviceWidth, 'x', frame.metadata.deviceHeight);
// }, {
//     format: 'jpeg',
//     quality: 80,
//     maxWidth: 1280,
//     maxHeight: 720,
// });

// // Inject mouse events
// await browser.injectMouseEvent({
//     type: 'mousePressed',
//     x: 100,
//     y: 200,
//     button: 'left',
// });

// // Inject keyboard events
// await browser.injectKeyboardEvent({
//     type: 'keyDown',
//     key: 'Enter',
//     code: 'Enter',
// });

// // Stop when done
// await new Promise(r => setTimeout(r, 2000));
// await browser.stopScreencast();
// await browser.close();