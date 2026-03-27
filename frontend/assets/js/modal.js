function openAppointment(id){

const loading=document.getElementById("loading-overlay")

loading.style.display="flex"

setTimeout(()=>{

loading.style.display="none"

const modal=document.getElementById("appointment-modal")

const content=document.getElementById("modal-content")

content.innerHTML=`

<div style="display:flex;gap:14px">

<img src="https://placedog.net/80/80" style="border-radius:50%">

<div>

<strong>Thor</strong><br>
Raça: Golden Retriever<br>
Tutor: Carlos<br>
Telefone: (16) 99999-9999

</div>

</div>

<br>

<strong>Serviço</strong><br>
Banho e Tosa

<br><br>

<strong>Observações</strong><br>
Pet agitado com secador.

`

modal.style.display="flex"

},3000)

}

function closeModal(){

document.getElementById("appointment-modal").style.display="none"

}