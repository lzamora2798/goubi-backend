import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
admin.initializeApp()
const messageObject = {
    "gas":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de gas'
        },
        topic: "gasRequest",
    },
    "water":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de agua'
        },
        topic: "waterRequest",
    },
    "recicle":{
        notification: {
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de reciclaje'
        },
        topic: "recicleRequest",
    },

};

const orderIdData= async (orderId: string | number | boolean | null,database:string) =>{
    return new Promise((resolve, reject) =>{
        const ref = admin.database().ref(database).orderByChild('orderid').equalTo(orderId);
        ref.once("value", function(snapshot) {
            snapshot.forEach(function(childSnapshot) {
                resolve(childSnapshot.key);
            });
          });
    })
};

const tokenIdUser = async (userId: string) =>{ 
    const ref = admin.firestore().collection("users").doc(userId);
    const doc = await ref.get();
    return doc.get('tokens') as Array<string>
};

export const onOrderCreate = functions.database
.ref('/requests/{orderId}')
.onCreate((snapshot,context)=>{
    let message;
    const data = snapshot.val()
    if (data.type == 'gas'){
        message = messageObject['gas']
    }
    else if(data.type == 'water'){
        message = messageObject['water']
    }
    else{
        message = messageObject['recicle']
    }

    admin.messaging()
        .send(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
        });  
})


export const onChatReceived = functions.database
.ref('/chats/{orderId}/{messageId}')
.onCreate(async (snapshot,context)=> {
    let message;
    const data = snapshot.val()
    
    const orderId = context.params.orderId
    const clientResult = await orderIdData(orderId,"clientProgress");
    const deliveryResult = await orderIdData(orderId,"deliveryProgress");
    const clientToken = await tokenIdUser(clientResult as string);
    const deliveryToken = await tokenIdUser(deliveryResult as string);
    if (data['type'] === 'client'){
        message = {
            notification: {
                title: 'Mensaje de Cliente',
                body: data['text']
            },
            tokens: deliveryToken
        }
    }else{
        message = {
            notification: {
                title: 'Mensaje de Repartidor',
                body: data['text']
            },
            tokens: clientToken
        }
    }
    admin.messaging()
        .sendMulticast(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
            return false
        });  
})


export const onCreateUser = functions.https.onRequest((req,res)=>{
    
    if(req.method == 'POST'){
        let headers = req.headers;
        let body = req.body;
        let envKey = process.env.KEY;
        console.log(headers)
        if ('api-key' in headers){
            if (headers['api-key'] == envKey){
                let fullname = `${body.firstname} ${body.lastname}`
                let number =''
                if (body.phone.length == 10){
                    let substring = body.phone.substring(1);
                    number = `+593${substring}`
                }
                else{
                    res.send({sucess:false
                            ,error:{
                            code:"noenoughLen"}})
                    
                }
                admin.auth().createUser({
                    email: body.email,
                    emailVerified: true,
                    phoneNumber: number,
                    password: body.password,
                    displayName: fullname,
                    disabled: false,
                })
                .then((userRecord) => {
                    console.log('Successfully created new user:', userRecord.uid);
                    admin.firestore().collection('users').doc(userRecord.uid).set({
                        email:body.email,
                        lastname:body.lastname,
                        name:body.firstname,
                        phone:number,
                        type:body.type,
                        status:true
                    }).then((info)=>{
                        res.send({sucess:true,body:info})
                    }).catch((error) => {
                        res.send({sucess:false,body:'cant create user on db',error:error})
                      });
                    
                  })
                  .catch((error) => {
                    res.send({sucess:false,body:'cant create user on auth',error:error})
                  });
            }else{
                res.send('api key doesnt match')
            }
        }else{
            res.send('no api key found')   
        }      
    }else{
        res.send('Only post method allow')
    }
}) 