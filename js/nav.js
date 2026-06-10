(function(){
  var btn=document.querySelector('.nav-toggle');
  var links=document.querySelector('.nav-links');
  if(!btn||!links)return;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    var open=links.classList.toggle('open');
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  document.addEventListener('click',function(e){
    if(links.classList.contains('open')&&!links.contains(e.target)&&!btn.contains(e.target)){
      links.classList.remove('open');
      btn.setAttribute('aria-expanded','false');
      btn.setAttribute('aria-label','Open menu');
    }
  });
})();
