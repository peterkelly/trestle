(get-op
    "add"
    "int"
    (lambda (v0)
        (*
            1
            2
            (lambda (v1)
                (*
                    3
                    4
                    (lambda (v2)
                        (v0 v1 v2 SUCC)))))))
