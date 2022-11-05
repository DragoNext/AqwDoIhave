// Make Aqwiki preetier or Darker o_o 

function addCss(fileName) {
  var nbottom = document.getElementById("page-options-bottom-tips");
  var link = document.createElement("link");
  link.type = "text/css";
  link.rel = "stylesheet";
  link.href = fileName;
  nbottom.appendChild(link);
}
