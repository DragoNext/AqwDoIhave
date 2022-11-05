// Make Aqwiki preetier or Darker o_o 

function addCss(fileName) {
  var nbottom = document.querySelectorAll("*")[0];
  var link = document.createElement("link");
  link.type = "text/css";
  link.rel = "stylesheet";
  link.href = fileName;
  nbottom.appendChild(link);
}
