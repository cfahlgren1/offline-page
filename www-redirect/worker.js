// Sends www.offlinepage.app to offlinepage.app. Notes are saved per address, so the app is only served from one.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "offlinepage.app";
    return Response.redirect(url.toString(), 301);
  },
};
